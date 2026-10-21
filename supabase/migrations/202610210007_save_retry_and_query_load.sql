-- Apply once after 006. No project, revision or experiment payload is rewritten.
-- Existing grants are preserved by CREATE OR REPLACE. A real stale edit still conflicts.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
create or replace function public.save_research_project(p_config jsonb,p_expected integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.projects; v_id uuid; v_config jsonb; v_now timestamptz:=clock_timestamp();
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if jsonb_typeof(p_config) is distinct from 'object' or coalesce(p_config->>'schemaVersion','') not in ('1','2') or jsonb_typeof(p_config->'objects') is distinct from 'array' or octet_length(p_config::text)>2000000
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
 if exists(select 1 from jsonb_array_elements(p_config->'objects') o where
   (o ? 'verticalHeight' or o ? 'baseElevation') and
   (p_config->>'schemaVersion'<>'2' or o->>'kind'<>'obstacle'
    or (o ? 'verticalHeight' and (jsonb_typeof(o->'verticalHeight')<>'number' or (o->>'verticalHeight')::numeric<=0 or (o->>'verticalHeight')::numeric>10000))
    or (o ? 'baseElevation' and (jsonb_typeof(o->'baseElevation')<>'number' or abs((o->>'baseElevation')::numeric)>1000000))))
 then raise exception 'Invalid physical obstacle dimensions'; end if;
 v_id:=(p_config->>'id')::uuid;
 -- Advisory lock also serializes competing first inserts of a client-generated UUID.
 perform pg_advisory_xact_lock(hashtextextended(v_id::text,0));
 select * into p from public.projects where id=v_id for update;
 if found then
  if private.project_role(v_id) not in ('owner','editor') or private.project_role(v_id) is null then raise exception 'Project access denied' using errcode='42501'; end if;
  if p_expected is distinct from p.version then
   -- An identical retry already reached the desired state. Never overwrite a different draft.
   if (p.config - array['updatedAt','cloudVersion','cloudOwnerId']) =
      (p_config - array['updatedAt','cloudVersion','cloudOwnerId']) then return p.config; end if;
   raise exception 'VERSION_CONFLICT: reload the cloud revision or save a copy' using errcode='40001';
  end if;
  p.version:=p.version+1;
 else
  p.id:=v_id; p.owner_id:=auth.uid(); p.version:=1;
 end if;
 v_config:=p_config || jsonb_build_object('cloudVersion',p.version,'cloudOwnerId',p.owner_id,'updatedAt',v_now);
 insert into public.projects(id,owner_id,name,archived,config,updated_at,version,schema_version)
 values(v_id,p.owner_id,trim(v_config->>'name'),coalesce((v_config->>'archived')::boolean,false),v_config,v_now,p.version,(v_config->>'schemaVersion')::integer)
 on conflict(id) do update set name=excluded.name,archived=excluded.archived,config=excluded.config,updated_at=excluded.updated_at,version=excluded.version,schema_version=excluded.schema_version;
 insert into public.project_revisions(project_id,version,config,author_id) values(v_id,p.version,v_config,auth.uid());
 return v_config;
end $$;

-- Explicit restore/team commands must retain strict version fencing even for identical configs.
create or replace function public.restore_project_revision(p_id uuid,p_version integer,p_expected integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb; v_version integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select version into v_version from public.projects where id=p_id for update;
 if private.project_role(p_id) not in ('owner','editor') or private.project_role(p_id) is null then raise exception 'Edit access required' using errcode='42501'; end if;
 if p_expected is distinct from v_version then raise exception 'VERSION_CONFLICT: reload the cloud revision or save a copy' using errcode='40001'; end if;
 select config into c from public.project_revisions where project_id=p_id and version=p_version;
 if c is null then raise exception 'Revision not found'; end if;
 return public.save_research_project(c,p_expected);
end $$;

create or replace function public.assign_project_team(p_id uuid,p_team uuid,p_expected integer) returns void language plpgsql security definer set search_path='' as $$
declare p public.projects; c jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into p from public.projects where id=p_id for update;
 if p.owner_id is distinct from auth.uid() or auth.uid() is null then raise exception 'Project owner required' using errcode='42501'; end if;
 if p_team is not null and not exists(select 1 from public.teams where id=p_team and owner_id=auth.uid()) then raise exception 'Team owner required' using errcode='42501'; end if;
 if p_expected is distinct from p.version then raise exception 'VERSION_CONFLICT: reload the cloud revision or save a copy' using errcode='40001'; end if;
 c:=public.save_research_project(p.config,p_expected);
 update public.projects set team_id=p_team where id=p_id;
end $$;

-- Bound expired-job maintenance and index the running lease lookup.
create index research_job_running_lease on public.research_jobs(lease_until) where status='running';
create index research_job_created on public.research_jobs(created_at desc);
create index experiment_created on public.experiment_runs(created_at desc);
create index template_created on public.network_templates(created_at desc);
create index project_team on public.projects(team_id) where team_id is not null;
create index share_project on public.share_links(project_id);
create or replace function public.claim_research_job() returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.research_jobs;
begin
 update public.research_jobs set status='interrupted',error='Worker lease expired after retry limit',updated_at=now()
 where id in (select id from public.research_jobs where status='running' and lease_until<now() and attempts>=2 order by lease_until for update skip locked limit 100);
 update public.research_jobs set status='failed',error='Queued job expired after 24 hours',updated_at=now() where id in (select id from public.research_jobs where status='queued' and created_at<now()-interval '24 hours' order by created_at for update skip locked limit 100);
 select * into job from public.research_jobs where (status='queued' and created_at>=now()-interval '24 hours') or (status='running' and lease_until<now() and attempts<2) order by created_at for update skip locked limit 1;
 if not found then return null; end if;
 update public.research_jobs set status='running',lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds',attempts=attempts+1,completed=0,error=null,updated_at=now() where id=job.id returning * into job;
 return to_jsonb(job);
end $$;

-- Service-only scheduling hint; NULL means no pending work and no timer is needed.
create function public.research_queue_wake_delay() returns double precision language plpgsql stable security definer set search_path='' as $$
declare next_lease timestamptz;
begin
 if exists(select 1 from public.research_jobs where status='queued') then return 2; end if;
 select min(lease_until) into next_lease from public.research_jobs where status='running';
 if next_lease is null then return null; end if;
 return greatest(2,extract(epoch from next_lease-now())+1);
end $$;
revoke all on function public.research_queue_wake_delay() from public,anon,authenticated;
grant execute on function public.research_queue_wake_delay() to service_role;

-- Avoid invoking activity functions for progress heartbeats and ordinary project saves.
drop trigger activity_job on public.research_jobs;
create trigger activity_job after update of status on public.research_jobs for each row
 when (old.status is distinct from new.status) execute function private.record_project_activity();
drop trigger activity_archive on public.projects;
create trigger activity_archive after update of team_id,archived on public.projects for each row
 when (old.team_id is distinct from new.team_id or old.archived is distinct from new.archived)
 execute function private.record_project_activity();
COMMIT;
