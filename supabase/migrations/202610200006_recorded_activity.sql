-- Transactional event references only. No configuration, tokens, URLs or error payloads.
-- Events begin at installation; this migration does not backfill history.
create table public.project_activity (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null,
 actor_id uuid,
 event text not null check(length(event) between 1 and 80),
 resource_id uuid not null,
 revision integer,
 created_at timestamptz not null default clock_timestamp()
);
create index project_activity_project on public.project_activity(project_id,created_at desc);
alter table public.project_activity enable row level security;
revoke all on public.project_activity from public,anon,authenticated;
grant select on public.project_activity to authenticated;
create policy activity_read on public.project_activity for select to authenticated
 using(private.project_role(project_id) is not null);

create function private.reject_activity_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Recorded activity is append-only'; end $$;
revoke all on function private.reject_activity_mutation() from public,anon,authenticated;
create trigger activity_immutable before update or delete on public.project_activity
 for each row execute function private.reject_activity_mutation();

create function private.record_project_activity() returns trigger language plpgsql security definer set search_path='' as $$
declare p uuid; r uuid; e text; v integer; actor uuid:=auth.uid();
begin
 if tg_table_name='project_revisions' then
  p:=new.project_id; r:=p; v:=new.version; actor:=new.author_id;
  e:=case when new.version=1 then 'project_created' else 'revision_saved' end;
 elsif tg_table_name='projects' then
  if new.team_id is distinct from old.team_id then
   insert into public.project_activity(project_id,actor_id,event,resource_id,revision) values(new.id,actor,'team_assignment_changed',new.id,new.version);
  end if;
  if new.archived is not distinct from old.archived then return new; end if;
  p:=new.id;r:=p;v:=new.version;e:=case when new.archived then 'project_archived' else 'project_restored' end;
 elsif tg_table_name='project_members' then
  if tg_op='UPDATE' and new.role is not distinct from old.role then return new; end if;
  if tg_op='DELETE' then p:=old.project_id;r:=old.user_id;e:='access_revoked';
  else p:=new.project_id;r:=new.user_id;e:=case when tg_op='INSERT' then 'access_granted' else 'access_role_changed' end; end if;
 elsif tg_table_name='share_links' then
  if tg_op='UPDATE' and new.revoked is not distinct from old.revoked then return new; end if;
  p:=new.project_id;r:=new.id;e:=case when new.revoked then 'invitation_revoked' else 'invitation_created' end;
 elsif tg_table_name='research_jobs' then
  if new.status is not distinct from old.status then return new; end if;
  p:=new.project_id;r:=new.id;e:='experiment_'||new.status;
 elsif tg_table_name='experiment_runs' then
  p:=new.project_id;r:=new.id;e:='result_published';
 elsif tg_table_name='research_artifacts' then
  select project_id into p from public.experiment_runs where id=new.run_id;
  r:=new.id;actor:=new.creator_id;e:='artifact_recorded';
 elsif tg_table_name='team_members' then
  if tg_op='UPDATE' and new.role is not distinct from old.role then return new; end if;
  if tg_op='DELETE' then
   insert into public.project_activity(project_id,actor_id,event,resource_id)
    select id,actor,'team_access_revoked',old.user_id from public.projects where team_id=old.team_id;
   return old;
  else
   insert into public.project_activity(project_id,actor_id,event,resource_id)
    select id,actor,case when tg_op='INSERT' then 'team_access_granted' else 'team_access_role_changed' end,new.user_id from public.projects where team_id=new.team_id;
   return new;
  end if;
 end if;
 insert into public.project_activity(project_id,actor_id,event,resource_id,revision) values(p,actor,e,r,v);
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function private.record_project_activity() from public,anon,authenticated;
create trigger activity_revision after insert on public.project_revisions for each row execute function private.record_project_activity();
create trigger activity_archive after update on public.projects for each row execute function private.record_project_activity();
create trigger activity_member after insert or update or delete on public.project_members for each row execute function private.record_project_activity();
create trigger activity_invitation after insert or update on public.share_links for each row execute function private.record_project_activity();
create trigger activity_job after update on public.research_jobs for each row execute function private.record_project_activity();
create trigger activity_result after insert on public.experiment_runs for each row execute function private.record_project_activity();
create trigger activity_artifact after insert on public.research_artifacts for each row execute function private.record_project_activity();
create trigger activity_team_member after insert or update or delete on public.team_members for each row execute function private.record_project_activity();
