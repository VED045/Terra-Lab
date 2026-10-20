-- Additive project schema 2: XY height retains its historical meaning.
-- No existing project/revision/run is rewritten. Apply before publishing schema-2 projects.
-- The old table checks also enforce v1. Keep column and JSON version consistent.
alter table public.projects drop constraint projects_schema_version_check;
alter table public.projects drop constraint projects_config_check;
alter table public.projects add constraint projects_schema_version_check check(schema_version in (1,2));
alter table public.projects add constraint projects_config_check check(jsonb_typeof(config)='object' and config->>'schemaVersion' in ('1','2') and schema_version=(config->>'schemaVersion')::integer);
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
  if p_expected is distinct from p.version then raise exception 'VERSION_CONFLICT: reload the cloud revision or save a copy' using errcode='40001'; end if;
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
