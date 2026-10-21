-- Additive collaboration center. Existing teams are the studio membership authority.
create table public.peer_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 username text not null unique check(username ~ '^[a-z][a-z0-9_]{2,31}$'),
 display_name text not null check(length(trim(display_name)) between 1 and 80),
 discoverable boolean not null default false, email_lookup boolean not null default false,
 studio_team_id uuid unique references public.teams(id), updated_at timestamptz not null default now()
);
create table private.peer_lookup_limits (user_id uuid primary key references auth.users(id) on delete cascade, window_start timestamptz not null, attempts integer not null);
revoke all on private.peer_lookup_limits from public,anon,authenticated;
create table public.access_requests (
 id uuid primary key default gen_random_uuid(), requester_id uuid not null references auth.users(id),
 recipient_id uuid not null references auth.users(id), team_id uuid not null references public.teams(id),
 role text not null check(role in ('viewer','editor')), granted_role text check(granted_role in ('viewer','editor')),
 message text not null default '' check(length(message)<=500),
 status text not null default 'pending' check(status in ('pending','accepted','rejected','withdrawn')),
 created_at timestamptz not null default now(), resolved_at timestamptz,
 check(requester_id<>recipient_id)
);
create unique index one_pending_studio_request on public.access_requests(requester_id,team_id) where status='pending';
create index access_requests_recipient on public.access_requests(recipient_id,created_at desc);
create table public.collaboration_notifications (
 id uuid primary key default gen_random_uuid(), recipient_id uuid not null references auth.users(id) on delete cascade,
 event_key text not null unique, event text not null, item_id uuid not null,
 created_at timestamptz not null default now(), read_at timestamptz
);
create index collaboration_notifications_recipient on public.collaboration_notifications(recipient_id,created_at desc);
alter table public.peer_profiles enable row level security;
alter table public.access_requests enable row level security;
alter table public.collaboration_notifications enable row level security;
revoke all on public.peer_profiles,public.access_requests,public.collaboration_notifications from public,anon,authenticated;
grant select on public.peer_profiles,public.access_requests,public.collaboration_notifications to authenticated;
create policy own_peer_profile on public.peer_profiles for select to authenticated using(user_id=auth.uid());
create policy request_participants on public.access_requests for select to authenticated using(requester_id=auth.uid() or recipient_id=auth.uid());
create policy notification_recipient on public.collaboration_notifications for select to authenticated using(recipient_id=auth.uid());

-- Extend, rather than duplicate, the existing invitation-token system.
alter table public.share_links alter column project_id drop not null;
alter table public.share_links add column team_id uuid references public.teams(id);
alter table public.share_links add column recipient_id uuid references auth.users(id);
alter table public.share_links add column message text not null default '' check(length(message)<=500);
alter table public.share_links add column accepted_at timestamptz;
alter table public.share_links add column rejected_at timestamptz;
alter table public.share_links drop constraint share_links_kind_check;
alter table public.share_links add constraint share_links_kind_check check(kind in ('project','template','configuration','experiment','report','team','studio'));
alter table public.share_links add constraint invitation_scope check(
 (project_id is not null and team_id is null and kind not in ('studio','team')) or
 (project_id is null and team_id is not null and kind in ('studio','team') and recipient_id is not null));
alter table public.share_links add constraint invitation_decision check(not (accepted_at is not null and rejected_at is not null));
create unique index one_pending_project_invitation on public.share_links(project_id,recipient_id) where recipient_id is not null and not revoked and accepted_at is null and rejected_at is null;
create unique index one_pending_team_invitation on public.share_links(team_id,recipient_id) where recipient_id is not null and not revoked and accepted_at is null and rejected_at is null;
create index targeted_invitation_recipient on public.share_links(recipient_id,created_at desc) where recipient_id is not null;

create function private.collaboration_owner(p_scope text,p_id uuid) returns uuid language sql stable security definer set search_path='' as $$
 select owner_id from public.projects where p_scope='project' and id=p_id
 union all select owner_id from public.teams where p_scope in ('team','studio') and id=p_id
$$;
create function private.collaboration_label(p_user uuid) returns text language sql stable security definer set search_path='' as $$
 select coalesce((select display_name from public.peer_profiles where user_id=p_user),p_user::text)
$$;
revoke all on function private.collaboration_owner(text,uuid),private.collaboration_label(uuid) from public,anon,authenticated;

create function public.save_peer_profile(p_username text,p_name text,p_discoverable boolean,p_email_lookup boolean,p_studio uuid default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_studio is not null and not exists(select 1 from public.teams where id=p_studio and owner_id=auth.uid()) then raise exception 'Studio owner required' using errcode='42501'; end if;
 insert into public.peer_profiles(user_id,username,display_name,discoverable,email_lookup,studio_team_id)
 values(auth.uid(),lower(trim(p_username)),trim(p_name),p_discoverable,p_email_lookup,p_studio)
 on conflict(user_id) do update set username=excluded.username,display_name=excluded.display_name,discoverable=excluded.discoverable,email_lookup=excluded.email_lookup,studio_team_id=excluded.studio_team_id,updated_at=now();
end $$;

create function public.find_collaboration_peer(p_query text) returns jsonb language plpgsql security definer set search_path='' as $$
declare q text:=lower(trim(p_query)); attempts integer; result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if q is null or length(q) not between 3 and 254 or (q !~ '^[a-z][a-z0-9_]{2,31}$' and q !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Enter an exact username or email'; end if;
 insert into private.peer_lookup_limits values(auth.uid(),now(),1) on conflict(user_id) do update
 set attempts=case when private.peer_lookup_limits.window_start<now()-interval '1 hour' then 1 else private.peer_lookup_limits.attempts+1 end,
 window_start=case when private.peer_lookup_limits.window_start<now()-interval '1 hour' then now() else private.peer_lookup_limits.window_start end
 returning peer_lookup_limits.attempts into attempts;
 if attempts>60 then return jsonb_build_object('limited',true,'peer',null); end if;
 -- Unique usernames, or exactly one verified email match. No prefix/wildcard/list endpoint.
 select jsonb_build_object('id',p.user_id,'username',p.username,'name',p.display_name,'studio_id',p.studio_team_id,'studio_name',t.name) into result
 from public.peer_profiles p left join public.teams t on t.id=p.studio_team_id
 where p.discoverable and p.user_id<>auth.uid() and
 ((position('@' in q)=0 and p.username=q) or (position('@' in q)>0 and p.email_lookup and p.user_id=(
 select min(u.id::text)::uuid from auth.users u where lower(u.email)=q and u.email_confirmed_at is not null having count(*)=1)));
 return jsonb_build_object('limited',false,'peer',result);
end $$;

create function public.request_studio_access(p_peer uuid,p_role text,p_message text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare team uuid; result uuid;
begin
 if auth.uid() is null or auth.uid()=p_peer then raise exception 'Choose another eligible peer' using errcode='42501'; end if;
 if p_role is null or p_role not in ('viewer','editor') or p_message is null or length(p_message)>500 then raise exception 'Invalid request'; end if;
 select studio_team_id into team from public.peer_profiles where user_id=p_peer and discoverable;
 if team is null or private.collaboration_owner('studio',team) is distinct from p_peer then raise exception 'Studio unavailable' using errcode='42501'; end if;
 perform 1 from public.teams where id=team for update;
 if exists(select 1 from public.team_members where team_id=team and user_id=auth.uid()) then raise exception 'Already a studio member'; end if;
 insert into public.access_requests(requester_id,recipient_id,team_id,role,message) values(auth.uid(),p_peer,team,p_role,trim(p_message))
 on conflict(requester_id,team_id) where status='pending' do nothing returning id into result;
 if result is null then select id into result from public.access_requests where requester_id=auth.uid() and team_id=team and status='pending'; end if;
 return result;
end $$;

create function public.decide_access_request(p_id uuid,p_action text,p_role text default null) returns void language plpgsql security definer set search_path='' as $$
declare r public.access_requests; granted text;
begin
 select * into r from public.access_requests where id=p_id;
 if auth.uid() is null or r.id is null or auth.uid() not in (r.requester_id,r.recipient_id) then raise exception 'Request unavailable' using errcode='42501'; end if;
 -- Lock the scope before the item, matching request creation and membership changes.
 perform 1 from public.teams where id=r.team_id for update;
 select * into r from public.access_requests where id=p_id for update;
 if p_action is null or p_action not in ('accepted','rejected','withdrawn') then raise exception 'Invalid decision'; end if;
 if (p_action='withdrawn' and auth.uid()<>r.requester_id) or (p_action<>'withdrawn' and (auth.uid()<>r.recipient_id or private.collaboration_owner('studio',r.team_id) is distinct from auth.uid())) then raise exception 'Decision not permitted' using errcode='42501'; end if;
 if r.status=p_action then return; end if;
 if r.status<>'pending' then raise exception 'Request already resolved' using errcode='PT409'; end if;
 if p_action='accepted' then
  granted:=coalesce(p_role,r.role);
  if granted not in ('viewer','editor') then raise exception 'Invalid role'; end if;
  insert into public.team_members values(r.team_id,r.requester_id,granted) on conflict(team_id,user_id) do update set role=case when public.team_members.role='editor' then 'editor' else excluded.role end;
 end if;
 update public.access_requests set status=p_action,granted_role=granted,resolved_at=now() where id=p_id;
end $$;

create function public.invite_collaboration_peers(p_scope text,p_resource uuid,p_peers uuid[],p_role text,p_message text default '') returns void language plpgsql security definer set search_path='' as $$
declare peer uuid; secret text;
begin
 if auth.uid() is null or private.collaboration_owner(p_scope,p_resource) is distinct from auth.uid() then raise exception 'Resource owner required' using errcode='42501'; end if;
 if p_scope is null or p_scope not in ('project','team','studio') or p_role is null or p_role not in ('viewer','editor') or p_message is null or length(p_message)>500 or coalesce(cardinality(p_peers),0) not between 1 and 20 then raise exception 'Invalid invitation'; end if;
 if p_scope='studio' and not exists(select 1 from public.peer_profiles where user_id=auth.uid() and studio_team_id=p_resource) then raise exception 'Studio unavailable'; end if;
 -- Resource locks also serialize grants, revocations and invitation retries.
 if p_scope='project' then perform 1 from public.projects where id=p_resource for update;
 else perform 1 from public.teams where id=p_resource for update; end if;
 foreach peer in array p_peers loop
  if peer is null or peer=auth.uid() or not exists(select 1 from public.peer_profiles where user_id=peer and discoverable) then raise exception 'Peer unavailable' using errcode='42501'; end if;
  if (p_scope='project' and exists(select 1 from public.project_members where project_id=p_resource and user_id=peer)) or
     (p_scope<>'project' and exists(select 1 from public.team_members where team_id=p_resource and user_id=peer)) then raise exception 'Peer already has direct membership'; end if;
  -- Expired offers remain visible in resolved history; release their pending uniqueness slot.
  update public.share_links set revoked=true where recipient_id=peer and not revoked and accepted_at is null and rejected_at is null and expires_at<=now()
   and ((p_scope='project' and project_id=p_resource) or (p_scope<>'project' and team_id=p_resource));
  if exists(select 1 from public.share_links where recipient_id=peer and not revoked and accepted_at is null and rejected_at is null and
   ((p_scope='project' and project_id=p_resource) or (p_scope<>'project' and team_id=p_resource))) then
   if exists(select 1 from public.share_links where recipient_id=peer and not revoked and accepted_at is null and rejected_at is null and
    ((p_scope='project' and project_id=p_resource) or (p_scope<>'project' and team_id=p_resource)) and (role is distinct from p_role or message is distinct from trim(p_message))) then
    raise exception 'A different invitation is already pending. Revoke it before changing the offer.' using errcode='PT409';
   end if;
   continue;
  end if;
  secret:=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
  insert into public.share_links(project_id,team_id,creator_id,recipient_id,token_hash,role,kind,message,expires_at)
  values(case when p_scope='project' then p_resource end,case when p_scope<>'project' then p_resource end,auth.uid(),peer,
   encode(sha256(convert_to(secret,'UTF8')),'hex'),p_role,p_scope,trim(p_message),now()+interval '7 days');
 end loop;
end $$;

create function public.decide_collaboration_invitation(p_id uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
declare link public.share_links; owner uuid;
begin
 select * into link from public.share_links where id=p_id;
 owner:=private.collaboration_owner(case when link.team_id is null then 'project' else 'team' end,coalesce(link.project_id,link.team_id));
 if auth.uid() is null or link.id is null or (auth.uid() is distinct from link.recipient_id and auth.uid() is distinct from owner) then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if link.team_id is null then perform 1 from public.projects where id=link.project_id for update;
 else perform 1 from public.teams where id=link.team_id for update; end if;
 select * into link from public.share_links where id=p_id for update;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if p_action in ('revoke','renew') then
  if owner is distinct from auth.uid() then raise exception 'Owner required' using errcode='42501'; end if;
  if p_action='revoke' then update public.share_links set revoked=true where id=p_id and not revoked; return; end if;
  if link.recipient_id is null or link.accepted_at is not null or link.rejected_at is not null or link.revoked then raise exception 'Create a new invitation for a resolved offer'; end if;
  -- Retry-safe: renew at most once per day; there is no email delivery to retry.
  update public.share_links set expires_at=now()+interval '7 days' where id=p_id and expires_at<now()+interval '6 days';
  return;
 end if;
 if auth.uid() is distinct from link.recipient_id or link.recipient_id is null then raise exception 'Recipient required' using errcode='42501'; end if;
 -- Same decision retries are safe; opposing/replayed decisions never recreate a grant.
 if (p_action='accept' and link.accepted_at is not null) or (p_action='reject' and link.rejected_at is not null) then return; end if;
 if link.revoked or link.expires_at<=now() or link.accepted_at is not null or link.rejected_at is not null then raise exception 'Invitation expired or resolved' using errcode='PT409'; end if;
 if p_action='accept' then
  if link.team_id is null then
   insert into public.project_members values(link.project_id,auth.uid(),link.role) on conflict(project_id,user_id) do update set role=case when public.project_members.role='editor' then 'editor' else excluded.role end;
  else
   insert into public.team_members values(link.team_id,auth.uid(),link.role) on conflict(team_id,user_id) do update set role=case when public.team_members.role='editor' then 'editor' else excluded.role end;
  end if;
  update public.share_links set accepted_at=now() where id=p_id;
 elsif p_action='reject' then update public.share_links set rejected_at=now() where id=p_id;
 else raise exception 'Invalid invitation decision'; end if;
end $$;

create or replace function public.redeem_research_share(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare link public.share_links;
begin
 if auth.uid() is null or length(p_token) is distinct from 64 then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 select * into link from public.share_links where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if not found or link.revoked or link.expires_at<=now() then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if link.team_id is null then perform 1 from public.projects where id=link.project_id for update;
 else perform 1 from public.teams where id=link.team_id for update; end if;
 select * into link from public.share_links where id=link.id for update;
 if not found or link.revoked or link.expires_at<=now() then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if link.recipient_id is not null then
  perform public.decide_collaboration_invitation(link.id,'accept');
 else
  insert into public.project_members values(link.project_id,auth.uid(),link.role) on conflict(project_id,user_id) do update set role=case when public.project_members.role='editor' then 'editor' else excluded.role end;
 end if;
 return jsonb_build_object('projectId',link.project_id,'teamId',link.team_id,'kind',link.kind,'targetId',link.target_id,'role',link.role);
end $$;
create or replace function public.revoke_research_share(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin perform public.decide_collaboration_invitation(p_id,'revoke'); end $$;

-- Lock resource rows consistently; membership cannot alter or duplicate the owner's authority.
create or replace function public.manage_project_member(p_id uuid,p_user uuid,p_role text) returns void language plpgsql security definer set search_path='' as $$
declare owner uuid;
begin
 select owner_id into owner from public.projects where id=p_id for update;
 if auth.uid() is null or owner is distinct from auth.uid() then raise exception 'Owner access required' using errcode='42501'; end if;
 if p_user is null or p_user=owner then raise exception 'Owner membership is protected'; end if;
 if p_role is null then delete from public.project_members where project_id=p_id and user_id=p_user;
 else insert into public.project_members values(p_id,p_user,p_role) on conflict(project_id,user_id) do update set role=excluded.role; end if;
end $$;
create or replace function public.manage_team_member(p_team uuid,p_user uuid,p_role text) returns void language plpgsql security definer set search_path='' as $$
declare owner uuid;
begin
 select owner_id into owner from public.teams where id=p_team for update;
 if auth.uid() is null or owner is distinct from auth.uid() then raise exception 'Team owner required' using errcode='42501'; end if;
 if p_user is null or p_user=owner then raise exception 'Owner membership is protected'; end if;
 if p_role is null then delete from public.team_members where team_id=p_team and user_id=p_user;
 else insert into public.team_members values(p_team,p_user,p_role) on conflict(team_id,user_id) do update set role=excluded.role; end if;
end $$;

-- Preserve legacy activity records for project invitations; team invites have no project.
create or replace function private.record_project_invitation_activity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.project_id is not null and (tg_op='INSERT' or new.revoked is distinct from old.revoked) then
  insert into public.project_activity(project_id,actor_id,event,resource_id) values(new.project_id,auth.uid(),case when new.revoked then 'invitation_revoked' else 'invitation_created' end,new.id);
 end if; return new;
end $$;
drop trigger activity_invitation on public.share_links;
create trigger activity_invitation after insert or update on public.share_links for each row execute function private.record_project_invitation_activity();

create function private.notify_collaboration(p_recipient uuid,p_key text,p_event text,p_item uuid) returns void language sql security definer set search_path='' as $$
 insert into public.collaboration_notifications(recipient_id,event_key,event,item_id) select p_recipient,p_key,p_event,p_item where p_recipient is not null on conflict(event_key) do nothing
$$;
create function private.collaboration_events() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid; item uuid; event text; key text; owner uuid;
begin
 if tg_table_name='access_requests' then
  if tg_op='UPDATE' and old.status=new.status then return new; end if;
  recipient:=case when new.status in ('pending','withdrawn') then new.recipient_id else new.requester_id end;
  item:=new.id;event:='request_'||new.status;key:=item::text||':'||event;
 elsif tg_table_name='share_links' then
  if new.recipient_id is null then return new; end if;
  item:=new.id;
  if tg_op='INSERT' then recipient:=new.recipient_id;event:='invitation_received';key:=item::text||':received';
  elsif new.revoked is distinct from old.revoked then recipient:=new.recipient_id;event:='invitation_revoked';key:=item::text||':revoked';
  elsif new.accepted_at is distinct from old.accepted_at then recipient:=new.creator_id;event:='invitation_accepted';key:=item::text||':accepted';
  elsif new.rejected_at is distinct from old.rejected_at then recipient:=new.creator_id;event:='invitation_rejected';key:=item::text||':rejected';
  elsif new.expires_at is distinct from old.expires_at then recipient:=new.recipient_id;event:='invitation_renewed';key:=item::text||':renewed:'||new.expires_at::text;
  else return new; end if;
 else
  if tg_op='UPDATE' and old.role=new.role then return new; end if;
  if tg_op='DELETE' then recipient:=old.user_id; else recipient:=new.user_id; end if;
  if tg_table_name='team_members' then
   if tg_op='DELETE' then item:=old.team_id; else item:=new.team_id; end if;
   event:='team_';owner:=private.collaboration_owner('team',item);
  else
   if tg_op='DELETE' then item:=old.project_id; else item:=new.project_id; end if;
   event:='project_';owner:=private.collaboration_owner('project',item);
  end if;
  event:=event||case when tg_op='DELETE' then 'access_revoked' when tg_op='UPDATE' then 'role_changed' else 'access_granted' end;
  key:=event||':'||item::text||':'||recipient::text||':'||txid_current()::text;
  perform private.notify_collaboration(owner,key||':owner',event,item);
 end if;
 perform private.notify_collaboration(recipient,key,event,item);
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger notify_request after insert or update on public.access_requests for each row execute function private.collaboration_events();
create trigger notify_invitation after insert or update on public.share_links for each row execute function private.collaboration_events();
create trigger notify_project_member after insert or update or delete on public.project_members for each row execute function private.collaboration_events();
create trigger notify_team_member after insert or update or delete on public.team_members for each row execute function private.collaboration_events();

-- Reuse the immutable activity stream for meaningful shared-project updates.
-- Notify current grantees only; previews stay generic and navigation rechecks access.
create function private.notify_shared_project_activity() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
 if new.event not in ('revision_saved','result_published','project_archived','project_restored','team_assignment_changed') then return new; end if;
 for recipient in
  select p.owner_id from public.projects p where p.id=new.project_id
  union select m.user_id from public.project_members m where m.project_id=new.project_id
  union select m.user_id from public.team_members m join public.projects p on p.team_id=m.team_id where p.id=new.project_id
  union select t.owner_id from public.teams t join public.projects p on p.team_id=t.id where p.id=new.project_id
 loop
  if recipient is distinct from new.actor_id then
   perform private.notify_collaboration(recipient,'activity:'||new.id::text||':'||recipient::text,'shared_project_updated',new.project_id);
  end if;
 end loop;
 return new;
end $$;
revoke all on function private.notify_shared_project_activity() from public,anon,authenticated;
create trigger notify_shared_activity after insert on public.project_activity for each row execute function private.notify_shared_project_activity();

create function public.mark_collaboration_read(p_id uuid default null) returns void language plpgsql security invoker set search_path='' as $$
begin
 update public.collaboration_notifications set read_at=coalesce(read_at,now()) where recipient_id=auth.uid() and (p_id is null or id=p_id) and read_at is null;
end $$;
grant update(read_at) on public.collaboration_notifications to authenticated;
create policy notification_read_state on public.collaboration_notifications for update to authenticated using(recipient_id=auth.uid()) with check(recipient_id=auth.uid());

create function public.collaboration_state() returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result jsonb;
begin
 if uid is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select jsonb_build_object('user_id',uid,'profile',(select to_jsonb(p) from public.peer_profiles p where p.user_id=uid),
 'resources',coalesce((select jsonb_agg(r order by r.updated_at desc) from (
  select p.id,p.name,'project'::text as scope,p.owner_id,private.collaboration_label(p.owner_id) as owner_name,private.project_role(p.id) as role,p.updated_at,p.version,p.team_id,
   concat_ws(', ',case when p.owner_id=uid then 'ownership' end,case when exists(select 1 from public.project_members m where m.project_id=p.id and m.user_id=uid) then 'direct grant' end,
   case when p.team_id is not null and private.team_access(p.team_id) then 'team membership' end,case when exists(select 1 from public.project_members m where m.project_id=p.id and m.user_id=uid) and exists(select 1 from public.share_links s where s.project_id=p.id and s.recipient_id=uid and s.accepted_at is not null) then 'accepted invitation' end) as source
  from public.projects p where private.project_role(p.id) is not null
  union all
  select t.id,t.name,case when exists(select 1 from public.peer_profiles p where p.studio_team_id=t.id) then 'studio' else 'team' end,t.owner_id,private.collaboration_label(t.owner_id),
   case when t.owner_id=uid then 'owner' else (select m.role from public.team_members m where m.team_id=t.id and m.user_id=uid) end,t.created_at,null::integer,null::uuid,
   case when t.owner_id=uid then 'ownership' else 'team membership' end
  from public.teams t where private.team_access(t.id)
 ) r),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'initiator_id',r.requester_id,'initiator',private.collaboration_label(r.requester_id),'recipient_id',r.recipient_id,'recipient',private.collaboration_label(r.recipient_id),'resource_id',r.team_id,'resource',t.name,'scope','studio','role',r.role,'granted_role',r.granted_role,'message',r.message,'status',r.status,'created_at',r.created_at,'resolved_at',r.resolved_at) order by r.created_at desc) from public.access_requests r join public.teams t on t.id=r.team_id where r.requester_id=uid or r.recipient_id=uid),'[]'::jsonb),
 'invitations',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'initiator_id',s.creator_id,'initiator',private.collaboration_label(s.creator_id),'recipient_id',s.recipient_id,'recipient',case when s.recipient_id is null then 'Anyone with the link' else private.collaboration_label(s.recipient_id) end,'resource_id',coalesce(s.project_id,s.team_id),
 'resource',case when s.project_id is not null and private.project_role(s.project_id) is not null then (select name from public.projects where id=s.project_id) when s.team_id is not null and private.team_access(s.team_id) then (select name from public.teams where id=s.team_id) else 'Private '||s.kind end,
 'scope',case when s.team_id is null then 'project' else s.kind end,'kind',s.kind,'role',s.role,'message',s.message,
 'status',case when s.revoked then 'revoked' when s.accepted_at is not null then 'accepted' when s.rejected_at is not null then 'rejected' when s.expires_at<=now() then 'expired' else 'pending' end,'created_at',s.created_at,'expires_at',s.expires_at) order by s.created_at desc)
 from public.share_links s where s.creator_id=uid or s.recipient_id=uid),'[]'::jsonb),
 'members',coalesce((select jsonb_agg(m) from (
  select m.project_id as resource_id,m.user_id,private.collaboration_label(m.user_id) as name,m.role,'direct grant'::text as source from public.project_members m join public.projects p on p.id=m.project_id where p.owner_id=uid
  union all select m.team_id,m.user_id,private.collaboration_label(m.user_id),m.role,'team membership' from public.team_members m join public.teams t on t.id=m.team_id where t.owner_id=uid
  union all select p.id,m.user_id,private.collaboration_label(m.user_id),m.role,'team: '||t.name from public.projects p join public.teams t on t.id=p.team_id join public.team_members m on m.team_id=t.id where p.owner_id=uid
  union all select p.id,t.owner_id,private.collaboration_label(t.owner_id),'editor','team owner: '||t.name from public.projects p join public.teams t on t.id=p.team_id where p.owner_id=uid and t.owner_id<>uid
 ) m),'[]'::jsonb),
 'notifications',coalesce((select jsonb_agg(n order by n.created_at desc) from (select id,event,item_id,created_at,read_at from public.collaboration_notifications where recipient_id=uid order by created_at desc limit 100) n),'[]'::jsonb),
 'unread',(select count(*) from public.collaboration_notifications where recipient_id=uid and read_at is null),
 'activity',coalesce((select jsonb_agg(a order by a.created_at desc) from (select id,project_id,event,created_at from public.project_activity where private.project_role(project_id) is not null order by created_at desc limit 20) a),'[]'::jsonb)
 ) into result;
 return result;
end $$;

-- All public RPC entry points explicitly authenticated; private helpers are not exposed.
do $$ declare fn record; begin
 for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='public' and p.proname in ('save_peer_profile','find_collaboration_peer','request_studio_access','decide_access_request','invite_collaboration_peers','decide_collaboration_invitation','mark_collaboration_read','collaboration_state'))
 or (n.nspname='private' and p.proname in ('collaboration_owner','collaboration_label','notify_collaboration','collaboration_events','record_project_invitation_activity')) loop
  execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
  if fn.signature::text not like 'private.%' then execute format('grant execute on function %s to authenticated',fn.signature); end if;
 end loop;
end $$;
