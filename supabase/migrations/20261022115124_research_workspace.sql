-- Additive document/library storage. Existing projects, solvers and immutable runs are untouched.
create table public.research_documents (
 id uuid primary key, project_id uuid not null references public.projects(id) on delete cascade, owner_id uuid not null references auth.users(id),
 title text not null check(length(title) between 1 and 160), authors text not null check(length(authors)<=300),
 source text not null check(length(source)<=120000), evidence jsonb not null default '[]' check(jsonb_typeof(evidence)='array' and jsonb_array_length(evidence)<=32 and octet_length(evidence::text)<=400000),
 version integer not null check(version between 1 and 128), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index research_documents_project on public.research_documents(project_id,updated_at desc);
create table public.research_document_members (
 document_id uuid not null references public.research_documents(id) on delete cascade, user_id uuid not null references auth.users(id), role text not null check(role in ('editor','viewer')),
 primary key(document_id,user_id)
);
create table public.research_document_revisions (
 document_id uuid not null references public.research_documents(id) on delete cascade,version integer not null,config jsonb not null,
 author_id uuid not null references auth.users(id),created_at timestamptz not null default now(),primary key(document_id,version)
);
create table public.research_library_assets (
 id uuid primary key,project_id uuid not null references public.projects(id) on delete cascade,owner_id uuid not null references auth.users(id),name text not null check(length(name) between 1 and 180),collection text not null check(length(collection)<=80),
 mime text not null check(mime in ('application/pdf','text/plain','text/markdown','application/x-tex','text/csv','application/json','image/png','image/jpeg')),
 bytes integer not null check(bytes between 1 and 10485760),sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),path text not null unique,
 extraction jsonb not null check(octet_length(extraction::text)<=300000),provenance jsonb not null check(octet_length(provenance::text)<=20000),
 version integer not null default 1,deleted boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index research_asset_hash on public.research_library_assets(project_id,sha256) where not deleted;
create index research_assets_project on public.research_library_assets(project_id,updated_at desc);
create function private.research_project_member(p_project uuid,p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.projects p where p.id=p_project and (
 p.owner_id=p_user or exists(select 1 from public.project_members m where m.project_id=p.id and m.user_id=p_user)
 or exists(select 1 from public.teams t where t.id=p.team_id and t.owner_id=p_user)
 or exists(select 1 from public.team_members m where m.team_id=p.team_id and m.user_id=p_user)))
$$;
create function private.research_document_role(p_id uuid) returns text language sql stable security definer set search_path='' as $$
 select case when private.project_role(d.project_id) is null then null
 when d.owner_id=auth.uid() then 'owner'
 when exists(select 1 from public.research_document_members m where m.document_id=d.id and m.user_id=auth.uid() and m.role='editor') and private.project_role(d.project_id) in ('owner','editor') then 'editor'
 when exists(select 1 from public.research_document_members m where m.document_id=d.id and m.user_id=auth.uid()) then 'viewer' end
 from public.research_documents d where d.id=p_id and auth.uid() is not null
$$;
create function private.research_library_upload_allowed(p_project uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or private.project_role(p_project) is null or private.project_role(p_project) not in ('owner','editor') then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended(p_project::text,10));
 return (select count(*) from storage.objects where bucket_id='research-library' and (storage.foldername(name))[2]=p_project::text)<256;
end $$;
revoke all on function private.research_library_upload_allowed(uuid) from public,anon;
grant execute on function private.research_library_upload_allowed(uuid) to authenticated;
create table public.research_workspace_events (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,
 document_id uuid references public.research_documents(id) on delete cascade,actor_id uuid not null references auth.users(id),
 action text not null check(action in ('document_saved','document_shared','document_revoked','asset_uploaded','asset_updated','asset_deleted')),
 details jsonb not null default '{}' check(octet_length(details::text)<=2000),created_at timestamptz not null default now()
);
create index research_workspace_event_project on public.research_workspace_events(project_id,created_at desc);
alter table public.research_workspace_events enable row level security;
revoke all on public.research_workspace_events from public,anon,authenticated;
grant select on public.research_workspace_events to authenticated;
create policy research_workspace_event_read on public.research_workspace_events for select to authenticated using(private.project_role(project_id) is not null and (document_id is null or private.research_document_role(document_id) is not null));
revoke all on function private.research_project_member(uuid,uuid) from public,anon,authenticated;
revoke all on function private.research_document_role(uuid) from public,anon;
grant execute on function private.research_document_role(uuid) to authenticated;
alter table public.research_documents enable row level security;
alter table public.research_document_members enable row level security;
alter table public.research_document_revisions enable row level security;
alter table public.research_library_assets enable row level security;
revoke all on public.research_documents,public.research_document_members,public.research_document_revisions,public.research_library_assets from anon,authenticated;
grant select on public.research_documents,public.research_document_members,public.research_document_revisions,public.research_library_assets to authenticated;
create policy research_document_read on public.research_documents for select to authenticated using(private.research_document_role(id) is not null);
create policy research_document_member_read on public.research_document_members for select to authenticated using(private.research_document_role(document_id)='owner' or (user_id=auth.uid() and private.research_document_role(document_id) is not null));
create policy research_document_revision_read on public.research_document_revisions for select to authenticated using(private.research_document_role(document_id) is not null);
create policy research_library_read on public.research_library_assets for select to authenticated using(not deleted and private.project_role(project_id) is not null);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('research-library','research-library',false,10485760,array['application/pdf','text/plain','text/markdown','application/x-tex','text/csv','application/json','image/png','image/jpeg']);
-- Prefixes are UUIDs checked before casting. No public URLs or arbitrary forwarding.
create policy research_library_upload on storage.objects for insert to authenticated with check(bucket_id='research-library' and
 (storage.foldername(name))[1]=auth.uid()::text and name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9-]{36}\.(pdf|txt|md|tex|csv|json|png|jpg|jpeg)$' and exists(select 1 from public.projects p where p.id::text=(storage.foldername(storage.objects.name))[2] and private.research_library_upload_allowed(p.id)));
create policy research_library_download on storage.objects for select to authenticated using(bucket_id='research-library' and (exists(select 1 from public.research_library_assets a where a.path=storage.objects.name and (not a.deleted or private.project_role(a.project_id) in ('owner','editor')) and private.project_role(a.project_id) is not null) or ((storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.projects p where p.id::text=(storage.foldername(storage.objects.name))[2] and private.project_role(p.id) in ('owner','editor')))));
create policy research_library_delete on storage.objects for delete to authenticated using(bucket_id='research-library' and exists(select 1 from public.projects p where p.id::text=(storage.foldername(storage.objects.name))[2] and private.project_role(p.id) in ('owner','editor')));

create function public.research_workspace_index(p_project uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or private.project_role(p_project) is null then raise exception 'Project access denied' using errcode='42501'; end if;
 return jsonb_build_object('documents',coalesce((select jsonb_agg(to_jsonb(d)||jsonb_build_object('role',private.research_document_role(d.id)) order by d.updated_at desc) from public.research_documents d where d.project_id=p_project and private.research_document_role(d.id) is not null),'[]'),
 'assets',coalesce((select jsonb_agg((to_jsonb(a)-'extraction')||jsonb_build_object('extraction',jsonb_build_object('status',a.extraction->'status','pages','[]'::jsonb,'truncated',a.extraction->'truncated')) order by a.updated_at desc) from public.research_library_assets a where a.project_id=p_project and not a.deleted),'[]'));
end $$;
create function public.share_research_document(p_id uuid,p_user uuid,p_role text) returns void language plpgsql security definer set search_path='' as $$
declare d public.research_documents;
begin
 select * into d from public.research_documents where id=p_id for update;
 if auth.uid() is null or private.research_document_role(p_id) is distinct from 'owner' or private.project_role(d.project_id) not in ('owner','editor') then raise exception 'Document owner access required' using errcode='42501'; end if;
 if p_user=d.owner_id or (p_role is not null and p_role not in ('viewer','editor')) then raise exception 'Invalid document grant';end if;
 if p_role is null then delete from public.research_document_members where document_id=p_id and user_id=p_user;
 else
  if not private.research_project_member(d.project_id,p_user) then raise exception 'Share the project through Collaboration before sharing this document' using errcode='42501';end if;
  insert into public.research_document_members values(p_id,p_user,p_role) on conflict(document_id,user_id) do update set role=excluded.role;
 end if;
 insert into public.research_workspace_events(project_id,document_id,actor_id,action,details) values(d.project_id,d.id,auth.uid(),case when p_role is null then 'document_revoked' else 'document_shared' end,jsonb_build_object('userId',p_user,'role',p_role));
end $$;
create function public.save_research_document(p_config jsonb,p_expected integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.research_documents; v_id uuid; v_project uuid; v_evidence jsonb='[]'; e jsonb; snapshot jsonb; c jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if jsonb_typeof(p_config) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_config) k where k not in ('id','project_id','title','authors','source','evidence')) then raise exception 'Invalid document fields';end if;
 v_id=(p_config->>'id')::uuid;v_project=(p_config->>'project_id')::uuid;
 if private.project_role(v_project) not in ('owner','editor') or private.project_role(v_project) is null then raise exception 'Project editor access required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_id::text,8));
 select * into d from public.research_documents where id=v_id for update;
 if found then
  if d.project_id<>v_project or private.research_document_role(v_id) not in ('owner','editor') or private.research_document_role(v_id) is null then raise exception 'Document editor access required' using errcode='42501';end if;
  if p_expected is distinct from d.version then raise exception 'VERSION_CONFLICT: preserve draft and reload' using errcode='PT409';end if;
 else
  if p_expected is not null then raise exception 'VERSION_CONFLICT: document unavailable' using errcode='PT409';end if;
  perform pg_advisory_xact_lock(hashtextextended(v_project::text,11));
  if (select count(*) from public.research_documents where project_id=v_project)>=128 then raise exception 'Project document limit reached';end if;
 end if;
 if jsonb_typeof(p_config->'evidence') is distinct from 'array' or jsonb_array_length(p_config->'evidence')>32 then raise exception 'Invalid evidence list';end if;
 for e in select value from jsonb_array_elements(p_config->'evidence') loop
  snapshot=null;
  if length(coalesce(e->>'caption',''))>400 then raise exception 'Caption too long';end if;
  if e->>'type'='run' then
   select jsonb_build_object('status',r.status,'configuration',r.request->'config','metrics',(select coalesce(jsonb_agg(m.value),'[]') from (select value from jsonb_array_elements(r.metrics) limit 20) m),'createdAt',r.created_at,'softwareVersion',r.software_version,'requestHash',r.request_hash,'revision',coalesce(r.request->'project'->>'cloudVersion','local')||':'||(r.request->'project'->>'updatedAt')) into snapshot from public.experiment_runs r where r.id=(e->>'runId')::uuid and r.project_id=v_project;
  elsif e->>'type'='asset' then
   select jsonb_build_object('mime',a.mime,'sha256',a.sha256,'provenance',a.provenance) into snapshot from public.research_library_assets a where a.id=(e->>'assetId')::uuid and a.project_id=v_project and not a.deleted;
  end if;
  if snapshot is null then raise exception 'Evidence source unavailable in this project' using errcode='42501';end if;
  v_evidence=v_evidence||jsonb_build_array((e-'snapshot')||jsonb_build_object('snapshot',snapshot));
 end loop;
 if d.id is not null and d.title=p_config->>'title' and d.authors=p_config->>'authors' and d.source=p_config->>'source' and d.evidence=v_evidence then return to_jsonb(d)||jsonb_build_object('role',private.research_document_role(d.id));end if;
 if d.version>=128 then raise exception 'Revision limit reached; export or save a copy';end if;
 if d.id is null then
  insert into public.research_documents(id,project_id,owner_id,title,authors,source,evidence,version) values(v_id,v_project,auth.uid(),p_config->>'title',p_config->>'authors',p_config->>'source',v_evidence,1) returning * into d;
 else
  update public.research_documents set title=p_config->>'title',authors=p_config->>'authors',source=p_config->>'source',evidence=v_evidence,version=version+1,updated_at=now() where id=v_id returning * into d;
 end if;
 c=jsonb_build_object('id',d.id,'project_id',d.project_id,'title',d.title,'authors',d.authors,'source',d.source,'evidence',d.evidence);
 insert into public.research_document_revisions values(d.id,d.version,c,auth.uid(),now());
 insert into public.research_workspace_events(project_id,document_id,actor_id,action,details) values(d.project_id,d.id,auth.uid(),'document_saved',jsonb_build_object('version',d.version));
 return to_jsonb(d)||jsonb_build_object('role',private.research_document_role(d.id));
end $$;

create function public.record_research_library_asset(p_asset jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.research_library_assets;v_project uuid=(p_asset->>'project_id')::uuid;v_id uuid=(p_asset->>'id')::uuid;
begin
 if auth.uid() is null or private.project_role(v_project) not in ('owner','editor') or private.project_role(v_project) is null then raise exception 'Project editor access required' using errcode='42501';end if;
 if p_asset->>'path' !~ ('^'||auth.uid()::text||'/'||v_project::text||'/'||v_id::text||'\.(pdf|txt|md|tex|csv|json|png|jpg|jpeg)$') then raise exception 'Invalid private asset path';end if;
 if not exists(select 1 from storage.objects where bucket_id='research-library' and name=p_asset->>'path') then raise exception 'Upload must finish before publishing metadata';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_project::text,9));
 select * into a from public.research_library_assets where project_id=v_project and sha256=p_asset->>'sha256' and not deleted;
 if found then return to_jsonb(a);end if;
 if (select count(*) from public.research_library_assets where project_id=v_project and not deleted)>=256 then raise exception 'Project asset limit reached';end if;
 if jsonb_typeof(p_asset->'extraction') is distinct from 'object' or p_asset->'extraction'->>'status' not in ('ready','empty','failed','not-applicable') or jsonb_typeof(p_asset->'extraction'->'pages') is distinct from 'array' or jsonb_array_length(p_asset->'extraction'->'pages')>40 then raise exception 'Invalid extraction metadata';end if;
 insert into public.research_library_assets(id,project_id,owner_id,name,collection,mime,bytes,sha256,path,extraction,provenance) values(v_id,v_project,auth.uid(),p_asset->>'name',p_asset->>'collection',p_asset->>'mime',(p_asset->>'bytes')::integer,p_asset->>'sha256',p_asset->>'path',p_asset->'extraction',p_asset->'provenance') returning * into a;
 insert into public.research_workspace_events(project_id,actor_id,action,details) values(a.project_id,auth.uid(),'asset_uploaded',jsonb_build_object('assetId',a.id));
 return to_jsonb(a);
end $$;
create function public.update_research_asset(p_id uuid,p_expected integer,p_name text,p_collection text,p_delete boolean) returns void language plpgsql security definer set search_path='' as $$
declare a public.research_library_assets;
begin
 select * into a from public.research_library_assets where id=p_id for update;
 if auth.uid() is null or a.id is null or private.project_role(a.project_id) not in ('owner','editor') or private.project_role(a.project_id) is null then raise exception 'Project editor access required' using errcode='42501';end if;
 if p_expected is distinct from a.version then raise exception 'VERSION_CONFLICT: refresh the asset' using errcode='PT409';end if;
 update public.research_library_assets set name=p_name,collection=p_collection,deleted=p_delete,version=version+1,updated_at=now() where id=p_id;
 insert into public.research_workspace_events(project_id,actor_id,action,details) values(a.project_id,auth.uid(),case when p_delete then 'asset_deleted' else 'asset_updated' end,jsonb_build_object('assetId',a.id));
end $$;
revoke all on function public.research_workspace_index(uuid),public.share_research_document(uuid,uuid,text),public.save_research_document(jsonb,integer),public.record_research_library_asset(jsonb),public.update_research_asset(uuid,integer,text,text,boolean) from public,anon,authenticated;
grant execute on function public.research_workspace_index(uuid),public.share_research_document(uuid,uuid,text),public.save_research_document(jsonb,integer),public.record_research_library_asset(jsonb),public.update_research_asset(uuid,integer,text,text,boolean) to authenticated;

create function public.search_research_assets(p_project uuid,p_query text) returns uuid[] language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or private.project_role(p_project) is null then raise exception 'Project access denied' using errcode='42501';end if;
 if p_query is null or length(p_query) not between 2 and 120 then raise exception 'Search requires 2 to 120 characters';end if;
 return array(select a.id from public.research_library_assets a where a.project_id=p_project and not a.deleted and position(lower(p_query) in lower(a.name||' '||a.collection||' '||a.extraction::text))>0 order by a.updated_at desc limit 256);
end $$;
revoke all on function public.search_research_assets(uuid,text) from public,anon,authenticated;
grant execute on function public.search_research_assets(uuid,text) to authenticated;
