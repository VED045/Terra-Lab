-- Append-only derived artifacts, distinct from immutable worker output.
create table public.research_artifacts (
 id uuid primary key default gen_random_uuid(), run_id uuid not null references public.experiment_runs(id),
 creator_id uuid not null references auth.users(id), kind text not null check(kind in ('svg','png','pdf','json','csv','manifest')),
 path text not null unique, sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 bytes integer not null check(bytes between 1 and 2097152),created_at timestamptz not null default now()
);
alter table public.research_artifacts enable row level security;
revoke all on public.research_artifacts from anon,authenticated;
grant select on public.research_artifacts to authenticated;
create policy artifacts_read on public.research_artifacts for select to authenticated using(exists(select 1 from public.experiment_runs r where r.id=run_id and private.project_role(r.project_id) is not null));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('research-artifacts','research-artifacts',false,2097152,array['application/json','application/pdf','image/png','image/svg+xml','text/csv']) on conflict(id) do nothing;
create policy artifact_upload on storage.objects for insert to authenticated with check(bucket_id='research-artifacts' and (storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.experiment_runs r where r.id::text=(storage.foldername(name))[2] and private.project_role(r.project_id) is not null));
create policy artifact_download on storage.objects for select to authenticated using(bucket_id='research-artifacts' and exists(select 1 from public.experiment_runs r where r.id::text=(storage.foldername(name))[2] and private.project_role(r.project_id) is not null));
create function public.record_research_artifact(p_run uuid,p_kind text,p_path text,p_sha text,p_bytes integer) returns uuid language plpgsql security definer set search_path='' as $$
declare identity uuid;
begin
 if auth.uid() is null or not exists(select 1 from public.experiment_runs r where r.id=p_run and private.project_role(r.project_id) is not null) then raise exception 'Experiment access required' using errcode='42501'; end if;
 if p_path !~ ('^'||auth.uid()::text||'/'||p_run::text||'/[a-f0-9-]{36}\.[a-z.]+$') then raise exception 'Invalid artifact path'; end if;
 if not exists(select 1 from storage.objects where bucket_id='research-artifacts' and name=p_path) then raise exception 'Upload artifact before publishing metadata'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_run::text,1));
 if (select count(*) from public.research_artifacts where run_id=p_run)>=128 then raise exception 'Artifact history limit reached (128 per run)'; end if;
 insert into public.research_artifacts(run_id,creator_id,kind,path,sha256,bytes) values(p_run,auth.uid(),p_kind,p_path,p_sha,p_bytes) returning id into identity;
 return identity;
end $$;
revoke all on function public.record_research_artifact(uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.record_research_artifact(uuid,text,text,text,integer) to authenticated;
