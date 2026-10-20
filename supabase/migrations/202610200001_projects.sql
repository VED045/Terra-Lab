-- Run with Supabase CLI migrations or paste into the SQL editor of a fresh project.
create extension if not exists pgcrypto;
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  archived boolean not null default false,
  schema_version integer not null default 1 check (schema_version = 1),
  config jsonb not null check (jsonb_typeof(config) = 'object' and config->>'schemaVersion' = '1'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_owner_updated on public.projects(owner_id, updated_at desc);
alter table public.projects enable row level security;
create policy "Read own projects" on public.projects for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Insert own projects" on public.projects for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "Update own projects" on public.projects for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "Delete own projects" on public.projects for delete to authenticated using ((select auth.uid()) = owner_id);
grant select, insert, update, delete on public.projects to authenticated;
revoke all on public.projects from anon;
-- Private user-owned JSON exports; browser uses the public key + user JWT, never a service key.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('project-exports','project-exports',false,2097152,array['application/json']) on conflict (id) do nothing;
create policy "Read own exports" on storage.objects for select to authenticated using (bucket_id='project-exports' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Create own exports" on storage.objects for insert to authenticated with check (bucket_id='project-exports' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Update own exports" on storage.objects for update to authenticated using (bucket_id='project-exports' and (storage.foldername(name))[1]=(select auth.uid())::text) with check (bucket_id='project-exports' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Delete own exports" on storage.objects for delete to authenticated using (bucket_id='project-exports' and (storage.foldername(name))[1]=(select auth.uid())::text);
