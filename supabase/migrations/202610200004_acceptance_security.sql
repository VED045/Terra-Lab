-- Phase 4A acceptance fixes. Apply only after 001, 002 and 003.
-- Current project access is required even when the caller originally submitted the job.
create or replace function public.cancel_research_job(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.research_jobs where id=p_id and private.project_role(project_id) is not null) then
  raise exception 'Job unavailable' using errcode='42501';
 end if;
 update public.research_jobs set cancel_requested=true,updated_at=now()
 where id=p_id and status in ('queued','running')
 and (owner_id=auth.uid() or private.project_role(project_id)='owner');
end $$;

-- Only the exact chunks in a published immutable manifest are downloadable.
-- Failed/stale attempts and partial uploads are not part of the published run.
drop policy research_results_read on storage.objects;
create policy research_results_read on storage.objects for select to authenticated using(
 bucket_id='research-results' and exists(
  select 1 from public.experiment_runs r
  where r.id::text=(storage.foldername(name))[1]
  and private.project_role(r.project_id) is not null
  and r.manifest->'paths' ? storage.objects.name
 )
);

-- The old per-user lock did not serialize the global capacity check.
create or replace function public.enqueue_research_job(p_request jsonb,p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
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
 -- Serialize the cross-user count and insert under one global transaction lock.
 perform pg_advisory_xact_lock(1937006964,4);
 if (select count(*) from public.research_jobs where status in ('queued','running'))>=100 then raise exception 'Global queue is full'; end if;
 insert into public.research_jobs(owner_id,project_id,request,request_hash,idempotency_key) values(auth.uid(),v_project,p_request,v_hash,p_key) returning id into identity;
 return identity;
end $$;

-- Bound uploaded objects too: metadata-only limits allowed unlimited orphan uploads.
create function private.can_upload_research_artifact(p_path text) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare v_run uuid;
begin
 if auth.uid() is null or p_path is null or p_path !~
  '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9-]{36}\.(svg|png|pdf|json|csv|manifest\.json)$'
  or split_part(p_path,'/',1)<>auth.uid()::text then return false; end if;
 begin v_run:=split_part(p_path,'/',2)::uuid;
 exception when invalid_text_representation then return false; end;
 if not exists(select 1 from public.experiment_runs r where r.id=v_run
  and private.project_role(r.project_id) is not null) then return false; end if;
 -- Same run-level lock as record_research_artifact; volatile queries see prior commits.
 perform pg_advisory_xact_lock(hashtextextended(v_run::text,1));
 return (select count(*) from storage.objects where bucket_id='research-artifacts'
  and split_part(name,'/',2)=v_run::text)<128;
end $$;
revoke all on function private.can_upload_research_artifact(text) from public,anon,authenticated;
grant execute on function private.can_upload_research_artifact(text) to authenticated;
drop policy artifact_upload on storage.objects;
create policy artifact_upload on storage.objects for insert to authenticated with check(
 bucket_id='research-artifacts' and private.can_upload_research_artifact(name)
);
