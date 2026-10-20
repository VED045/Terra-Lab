-- Phase 3. Apply after 202610200001. All writes use checked transactional RPCs.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;
alter table public.projects add column version integer not null default 1;
alter table public.projects add column team_id uuid;
create table public.teams (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 name text not null check(length(trim(name)) between 1 and 80), created_at timestamptz not null default now()
);
alter table public.projects add constraint project_team_fk foreign key(team_id) references public.teams(id) on delete set null;
create table public.team_members (
 team_id uuid references public.teams(id) on delete cascade, user_id uuid references auth.users(id) on delete cascade,
 role text not null check(role in ('viewer','editor')), primary key(team_id,user_id)
);
create table public.project_members (
 project_id uuid references public.projects(id) on delete cascade, user_id uuid references auth.users(id) on delete cascade,
 role text not null check(role in ('viewer','editor')), primary key(project_id,user_id)
);
create table public.project_revisions (
 project_id uuid references public.projects(id) on delete cascade, version integer not null,
 config jsonb not null, author_id uuid references auth.users(id), created_at timestamptz not null default now(),
 primary key(project_id,version)
);
insert into public.project_revisions(project_id,version,config,author_id) select id,version,config,owner_id from public.projects;
create table public.project_stars (
 user_id uuid references auth.users(id) on delete cascade, project_id uuid references public.projects(id) on delete cascade,
 primary key(user_id,project_id)
);
create table public.network_templates (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 project_id uuid references public.projects(id) on delete set null,
 name text not null check(length(trim(name)) between 1 and 80), config jsonb not null,
 created_at timestamptz not null default now(), check(octet_length(config::text)<=2000000)
);
create table public.share_links (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 creator_id uuid not null references auth.users(id), token_hash text not null unique,
 role text not null check(role in ('viewer','editor')), kind text not null check(kind in ('project','template','configuration','experiment','report')),
 target_id uuid, expires_at timestamptz not null, revoked boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.research_jobs (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 project_id uuid not null references public.projects(id), request jsonb not null, request_hash text not null,
 idempotency_key uuid not null, status text not null default 'queued' check(status in ('queued','running','completed','cancelled','failed','interrupted')),
 completed integer not null default 0, planned integer not null default 0,
 cancel_requested boolean not null default false, lease_token uuid, lease_until timestamptz, attempts integer not null default 0,
 error text, logs jsonb not null default '[]', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(owner_id,idempotency_key), check(octet_length(request::text)<=2000000)
);
create index research_job_queue on public.research_jobs(status,created_at);
create index research_job_project on public.research_jobs(project_id,created_at desc);
create table public.experiment_runs (
 id uuid primary key references public.research_jobs(id), project_id uuid not null references public.projects(id),
 owner_id uuid not null references auth.users(id), request jsonb not null, request_hash text not null,
 software_version text not null, status text not null check(status in ('completed','cancelled','failed','interrupted')),
 metrics jsonb not null, manifest jsonb not null, logs jsonb not null, created_at timestamptz not null default now()
);
create index experiment_project on public.experiment_runs(project_id,created_at desc);

create function private.project_role(p_id uuid) returns text language sql stable security definer set search_path='' as $$
 select case when p.owner_id=auth.uid() then 'owner'
 when exists(select 1 from public.project_members m where m.project_id=p.id and m.user_id=auth.uid() and m.role='editor')
 or exists(select 1 from public.teams t where t.id=p.team_id and t.owner_id=auth.uid())
 or exists(select 1 from public.team_members m where m.team_id=p.team_id and m.user_id=auth.uid() and m.role='editor') then 'editor'
 when exists(select 1 from public.project_members m where m.project_id=p.id and m.user_id=auth.uid())
 or exists(select 1 from public.team_members m where m.team_id=p.team_id and m.user_id=auth.uid()) then 'viewer' end
 from public.projects p where p.id=p_id and auth.uid() is not null
$$;
create function private.team_access(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.teams t where t.id=p_id and (t.owner_id=auth.uid() or exists(select 1 from public.team_members m where m.team_id=t.id and m.user_id=auth.uid())))
$$;
revoke all on function private.project_role(uuid),private.team_access(uuid) from public,anon;
grant execute on function private.project_role(uuid),private.team_access(uuid) to authenticated,service_role;

drop policy "Read own projects" on public.projects;
drop policy "Insert own projects" on public.projects;
drop policy "Update own projects" on public.projects;
drop policy "Delete own projects" on public.projects;
revoke all on public.projects from authenticated,anon;
grant select on public.projects to authenticated;
create policy project_read on public.projects for select to authenticated using(private.project_role(id) is not null);
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.project_members enable row level security;
alter table public.project_revisions enable row level security;
alter table public.project_stars enable row level security;
alter table public.network_templates enable row level security;
alter table public.share_links enable row level security;
alter table public.research_jobs enable row level security;
alter table public.experiment_runs enable row level security;
revoke all on public.teams,public.team_members,public.project_members,public.project_revisions,public.project_stars,public.network_templates,public.share_links,public.research_jobs,public.experiment_runs from anon,authenticated;
grant select on public.teams,public.team_members,public.project_members,public.project_revisions,public.project_stars,public.network_templates,public.share_links,public.research_jobs,public.experiment_runs to authenticated;
grant insert,delete on public.project_stars to authenticated;
create policy team_read on public.teams for select to authenticated using(private.team_access(id));
create policy team_members_read on public.team_members for select to authenticated using(private.team_access(team_id));
create policy members_read on public.project_members for select to authenticated using(private.project_role(project_id) is not null);
create policy revision_read on public.project_revisions for select to authenticated using(private.project_role(project_id) is not null);
create policy stars_read on public.project_stars for select to authenticated using(user_id=auth.uid());
create policy stars_add on public.project_stars for insert to authenticated with check(user_id=auth.uid() and private.project_role(project_id) is not null);
create policy stars_delete on public.project_stars for delete to authenticated using(user_id=auth.uid());
create policy templates_read on public.network_templates for select to authenticated using(owner_id=auth.uid() or private.project_role(project_id) is not null);
create policy shares_read on public.share_links for select to authenticated using(private.project_role(project_id)='owner');
create policy jobs_read on public.research_jobs for select to authenticated using(private.project_role(project_id) is not null);
create policy runs_read on public.experiment_runs for select to authenticated using(private.project_role(project_id) is not null);

-- Writes are serialized under a row lock; a stale client cannot overwrite a newer version.
create function public.save_research_project(p_config jsonb,p_expected integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.projects; v_id uuid; v_config jsonb; v_now timestamptz:=clock_timestamp();
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if jsonb_typeof(p_config) is distinct from 'object' or p_config->>'schemaVersion' is distinct from '1' or jsonb_typeof(p_config->'objects') is distinct from 'array' or octet_length(p_config::text)>2000000
 or coalesce(length(trim(p_config->>'name')),0) not between 1 and 80 then raise exception 'Invalid project configuration'; end if;
 if not (p_config ?& array['id','name','description','archived','updatedAt','settings','canvas'])
 or jsonb_typeof(p_config->'settings') is distinct from 'object' or jsonb_typeof(p_config->'canvas') is distinct from 'object'
 or jsonb_typeof(p_config->'description') is distinct from 'string' or length(p_config->>'description')>500
 or jsonb_typeof(p_config->'archived') is distinct from 'boolean' or jsonb_array_length(p_config->'objects')>500 then raise exception 'Incomplete or invalid project structure'; end if;
 if exists(select 1 from jsonb_array_elements(p_config->'objects') o where jsonb_typeof(o) is distinct from 'object'
 or coalesce(o->>'kind','') not in ('anchor','receiver','obstacle','trajectory') or coalesce(length(o->>'id'),0) not between 1 and 100
 or jsonb_typeof(o->'x') is distinct from 'number' or jsonb_typeof(o->'y') is distinct from 'number')
 or (select count(*) from jsonb_array_elements(p_config->'objects'))<>(select count(distinct o->>'id') from jsonb_array_elements(p_config->'objects') o)
 then raise exception 'Invalid network object structure'; end if;
 v_id:=(p_config->>'id')::uuid;
 -- Advisory lock also serializes competing first inserts of a client-generated UUID.
 perform pg_advisory_xact_lock(hashtextextended(v_id::text,0));
 select * into p from public.projects where id=v_id for update;
 if found then
  if private.project_role(v_id) not in ('owner','editor') or private.project_role(v_id) is null then raise exception 'Project access denied' using errcode='42501'; end if;
  if p_expected is distinct from p.version then raise exception 'VERSION_CONFLICT: reload the cloud revision or save a copy' using errcode='40001'; end if;
  p.version:=p.version+1;
 else
  p.id:=v_id; p.owner_id:=auth.uid(); p.version:=1;
 end if;
 v_config:=p_config || jsonb_build_object('cloudVersion',p.version,'cloudOwnerId',p.owner_id,'updatedAt',v_now);
 insert into public.projects(id,owner_id,name,archived,config,updated_at,version)
 values(v_id,p.owner_id,trim(v_config->>'name'),coalesce((v_config->>'archived')::boolean,false),v_config,v_now,p.version)
 on conflict(id) do update set name=excluded.name,archived=excluded.archived,config=excluded.config,updated_at=excluded.updated_at,version=excluded.version;
 insert into public.project_revisions(project_id,version,config,author_id) values(v_id,p.version,v_config,auth.uid());
 return v_config;
end $$;
create function public.delete_research_project(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if private.project_role(p_id) is distinct from 'owner' then raise exception 'Owner access required' using errcode='42501'; end if;
 if exists(select 1 from public.research_jobs where project_id=p_id) then raise exception 'Project has immutable experiment history; archive it instead'; end if;
 delete from public.projects where id=p_id;
end $$;
create function public.restore_project_revision(p_id uuid,p_version integer,p_expected integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb;
begin
 if private.project_role(p_id) not in ('owner','editor') or private.project_role(p_id) is null then raise exception 'Edit access required' using errcode='42501'; end if;
 select config into c from public.project_revisions where project_id=p_id and version=p_version;
 if c is null then raise exception 'Revision not found'; end if;
 return public.save_research_project(c,p_expected);
end $$;
create function public.manage_project_member(p_id uuid,p_user uuid,p_role text) returns void language plpgsql security definer set search_path='' as $$
begin
 if private.project_role(p_id) is distinct from 'owner' then raise exception 'Owner access required' using errcode='42501'; end if;
 if p_role is null then delete from public.project_members where project_id=p_id and user_id=p_user;
 else insert into public.project_members values(p_id,p_user,p_role) on conflict(project_id,user_id) do update set role=excluded.role; end if;
end $$;
create function public.create_research_team(p_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare identity uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 insert into public.teams(owner_id,name) values(auth.uid(),trim(p_name)) returning id into identity; return identity;
end $$;
create function public.manage_team_member(p_team uuid,p_user uuid,p_role text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.teams where id=p_team and owner_id=auth.uid()) then raise exception 'Team owner required' using errcode='42501'; end if;
 if p_role is null then delete from public.team_members where team_id=p_team and user_id=p_user;
 else insert into public.team_members values(p_team,p_user,p_role) on conflict(team_id,user_id) do update set role=excluded.role; end if;
end $$;
create function public.assign_project_team(p_id uuid,p_team uuid,p_expected integer) returns void language plpgsql security definer set search_path='' as $$
declare p public.projects; c jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into p from public.projects where id=p_id for update;
 if p.owner_id is distinct from auth.uid() or auth.uid() is null then raise exception 'Project owner required' using errcode='42501'; end if;
 if p_team is not null and not exists(select 1 from public.teams where id=p_team and owner_id=auth.uid()) then raise exception 'Team owner required' using errcode='42501'; end if;
 c:=public.save_research_project(p.config,p_expected);
 update public.projects set team_id=p_team where id=p_id;
end $$;
create function public.save_network_template(p_id uuid,p_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare identity uuid;
begin
 if private.project_role(p_id) is null then raise exception 'Project access denied' using errcode='42501'; end if;
 insert into public.network_templates(owner_id,project_id,name,config) select auth.uid(),id,trim(p_name),config from public.projects where id=p_id returning id into identity; return identity;
end $$;
create function public.delete_network_template(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 delete from public.network_templates where id=p_id and owner_id=auth.uid();
 if not found then raise exception 'Template owner required' using errcode='42501'; end if;
end $$;
create function public.create_research_share(p_id uuid,p_role text,p_kind text,p_target uuid default null) returns text language plpgsql security definer set search_path='' as $$
declare secret text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
begin
 if private.project_role(p_id) is distinct from 'owner' then raise exception 'Owner access required' using errcode='42501'; end if;
 if p_kind in ('experiment','report') and not exists(select 1 from public.experiment_runs where id=p_target and project_id=p_id) then raise exception 'Saved experiment required'; end if;
 if p_kind='template' and not exists(select 1 from public.network_templates where id=p_target and project_id=p_id) then raise exception 'Saved template required'; end if;
 if p_kind<>'project' and p_role<>'viewer' then raise exception 'Snapshot shares must be read-only'; end if;
 insert into public.share_links(project_id,creator_id,token_hash,role,kind,target_id,expires_at)
 values(p_id,auth.uid(),encode(sha256(convert_to(secret,'UTF8')),'hex'),p_role,p_kind,p_target,now()+interval '7 days');
 return secret;
end $$;
create function public.redeem_research_share(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare link public.share_links;
begin
 if auth.uid() is null then raise exception 'Sign in to accept a research invitation' using errcode='42501'; end if;
 if length(p_token)<>64 then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 select * into link from public.share_links where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and not revoked and expires_at>now() for update;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 insert into public.project_members(project_id,user_id,role) values(link.project_id,auth.uid(),link.role)
 on conflict(project_id,user_id) do update set role=case when public.project_members.role='editor' then 'editor' else excluded.role end;
 return jsonb_build_object('projectId',link.project_id,'kind',link.kind,'targetId',link.target_id,'role',link.role);
end $$;
create function public.revoke_research_share(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.share_links set revoked=true where id=p_id and private.project_role(project_id)='owner';
 if not found then raise exception 'Owner access required' using errcode='42501'; end if;
end $$;

-- Durable queue. Clients cannot claim, heartbeat, finalize, upload results, or mutate job state.
create function public.enqueue_research_job(p_request jsonb,p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare identity uuid; v_project uuid:=(p_request->'project'->>'id')::uuid; v_hash text:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex'); previous public.research_jobs;
begin
 if private.project_role(v_project) not in ('owner','editor') or private.project_role(v_project) is null then raise exception 'Edit access required to run experiments' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into previous from public.research_jobs where owner_id=auth.uid() and idempotency_key=p_key;
 if found then
  if previous.request_hash<>v_hash then raise exception 'Idempotency key belongs to a different request' using errcode='40001'; end if;
  return previous.id;
 end if;
 if (select count(*) from public.research_jobs where owner_id=auth.uid() and status in ('queued','running'))>=4 then raise exception 'Four jobs already queued/running'; end if;
 if (select count(*) from public.research_jobs where status in ('queued','running'))>=100 then raise exception 'Global queue is full'; end if;
 insert into public.research_jobs(owner_id,project_id,request,request_hash,idempotency_key) values(auth.uid(),v_project,p_request,v_hash,p_key) returning id into identity;
 return identity;
end $$;
create function public.cancel_research_job(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.research_jobs set cancel_requested=true,updated_at=now() where id=p_id and status in ('queued','running') and (owner_id=auth.uid() or private.project_role(project_id)='owner');
 if not found and not exists(select 1 from public.research_jobs where id=p_id and private.project_role(project_id) is not null) then raise exception 'Job unavailable' using errcode='42501'; end if;
end $$;
create function public.claim_research_job() returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.research_jobs;
begin
 update public.research_jobs set status='interrupted',error='Worker lease expired after retry limit',updated_at=now()
 where status='running' and lease_until<now() and attempts>=2;
 update public.research_jobs set status='failed',error='Queued job expired after 24 hours',updated_at=now() where status='queued' and created_at<now()-interval '24 hours';
 select * into job from public.research_jobs where status='queued' or (status='running' and lease_until<now() and attempts<2) order by created_at for update skip locked limit 1;
 if not found then return null; end if;
 update public.research_jobs set status='running',lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds',attempts=attempts+1,completed=0,error=null,updated_at=now() where id=job.id returning * into job;
 return to_jsonb(job);
end $$;
create function public.heartbeat_research_job(p_id uuid,p_lease uuid,p_completed integer,p_planned integer) returns boolean language plpgsql security definer set search_path='' as $$
declare cancel boolean;
begin
 update public.research_jobs set lease_until=now()+interval '90 seconds',updated_at=now(),completed=greatest(completed,p_completed),planned=p_planned
 where id=p_id and lease_token=p_lease and status='running' and lease_until>now() returning cancel_requested into cancel;
 if not found then raise exception 'Worker lease lost'; end if;
 return cancel;
end $$;
create function public.finish_research_job(p_id uuid,p_lease uuid,p_status text,p_manifest jsonb,p_metrics jsonb,p_logs jsonb,p_version text,p_completed integer,p_planned integer,p_error text default null) returns void language plpgsql security definer set search_path='' as $$
declare job public.research_jobs;
begin
 select * into job from public.research_jobs where id=p_id for update;
 if job.status<>'running' or job.lease_token is distinct from p_lease or job.lease_until<now() then raise exception 'Worker lease lost'; end if;
 if p_status not in ('completed','cancelled','failed','interrupted') then raise exception 'Invalid terminal status'; end if;
 if p_manifest is not null then
  insert into public.experiment_runs(id,project_id,owner_id,request,request_hash,software_version,status,metrics,manifest,logs)
  values(job.id,job.project_id,job.owner_id,job.request,job.request_hash,p_version,p_status,p_metrics,p_manifest,p_logs);
 end if;
 update public.research_jobs set status=p_status,error=left(p_error,1000),logs=p_logs,completed=p_completed,planned=p_planned,lease_until=null,lease_token=null,updated_at=now() where id=p_id;
end $$;

-- Revoke PostgreSQL's default PUBLIC execution, including any explicit Supabase default grants.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='public' and p.proname in
 ('save_research_project','delete_research_project','restore_project_revision','manage_project_member','create_research_team','manage_team_member','assign_project_team','save_network_template','delete_network_template','create_research_share','redeem_research_share','revoke_research_share','enqueue_research_job','cancel_research_job','claim_research_job','heartbeat_research_job','finish_research_job')
 loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 if f.proname in ('claim_research_job','heartbeat_research_job','finish_research_job') then execute format('grant execute on function %s to service_role',f.signature);
 else execute format('grant execute on function %s to authenticated',f.signature); end if;
 end loop;
end $$;
grant all on public.research_jobs to service_role;
revoke update,delete,truncate on public.experiment_runs from service_role;
grant select,insert on public.experiment_runs to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('research-results','research-results',false,2097152,array['application/json']) on conflict(id) do nothing;
create policy research_results_read on storage.objects for select to authenticated using(bucket_id='research-results' and exists(
 select 1 from public.research_jobs j where j.id::text=(storage.foldername(name))[1] and private.project_role(j.project_id) is not null
));
-- No authenticated INSERT/UPDATE/DELETE on research-results: the service-only worker publishes immutable chunks.
