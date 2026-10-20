# Database schema, authorization and migrations

Apply migrations in filename order. On a Phase 2 project where `202610200001_projects.sql` is already installed, apply **002 and 003 only**. They are versioned, transactional migration files, not scripts to run repeatedly. Back up your database and try a staging/local stack first. The code has not applied changes to the user's hosted Supabase project.

| Table | Purpose / write contract |
|---|---|
| projects | Owner, optional team, current schema-1 configuration, archive state and monotonically increasing version. Checked save RPC only. |
| project_revisions | One immutable configuration per project/version with author and timestamp. Restore creates another revision. |
| project_stars | Personal preferences; only the current user inserts/deletes their own accessible project stars. |
| teams / team_members | Explicit team owner plus viewer/editor membership, changed by team owner RPC. |
| project_members | Direct viewer/editor grants; project owner changes/revokes them. |
| network_templates | Frozen structured copies, visible to creator or current project collaborators; copies receive fresh project IDs. |
| share_links | 244-bit random token hashed with SHA-256, role/kind/target, seven-day expiry, revocation. Raw token returned once. |
| research_jobs | Immutable input/config hash and idempotency key; mutable queue state, progress, leases, cancellation, safe error and logs. |
| experiment_runs | Immutable worker output metadata, exact request/config hash, scientific version, metrics, logs and artifact manifest. |
| research_artifacts | Append-only user-generated derivative metadata: run, actor, kind, bytes, SHA-256 and private path. |

All public research tables enable RLS. No anonymous research table grants exist. All project/team/revision/job/run/template/share writes are revoked from browser roles, except the deliberately per-user `project_stars` operations. RPCs enforce `auth.uid()`, current project/team roles and expected versions. Security checks are independent of client-supplied owner/version fields. SQL checks bound object types/names/body sizes; the web project schema and numerical worker additionally validate complete supported configurations. Invalid direct RPC numerical payloads fail in the worker, without being executed as code.

| Operation | Owner | Editor | Viewer | Stranger / anonymous |
|---|---|---|---|---|
| Read project/revisions/history/export | yes | yes | yes | denied |
| Save/restore/run experiment | yes | yes | denied | denied |
| Delete project with no research jobs | yes | denied | denied | denied |
| Delete project with immutable job/history | archive instead | denied | denied | denied |
| Manage project access/invitations/team assignment | yes | denied | denied | denied |
| Manage a team's membership | team owner only | denied | denied | denied |
| Claim/heartbeat/finalize/upload raw result | worker only | worker only | worker only | denied |
| Append a derivative export to a run | yes | yes | yes | denied |
| Change/delete historical run or derivative metadata | denied | denied | denied | denied |

Team owners/editors inherit project edit access for projects assigned to that team; team viewers inherit read access. A direct editor grant wins over a viewer grant. Ownership is retained by the original account. Ownership transfer, anonymous public reports, email invitation delivery, real-time editing and organization billing are outside this implementation.

All five invitation kinds (`project`, `template`, `configuration`, `experiment`, `report`) grant **project membership**, including the project's complete history and exports. They are authenticated research invitations, not isolated single-file bearer downloads. Snapshot/report kinds only grant viewer access. Expiry/revocation stops new redemption; it does not silently remove previously accepted members. Remove their direct/team grants separately. Previously downloaded copies remain theirs. No email is sent automatically.

Private Storage buckets:

- `project-exports`: retained Phase 1/2 personal backups, 2 MB JSON objects, first folder=user ID; existing per-owner policies.
- `research-results`: worker-only immutable uploads, 2 MB JSON objects. Read access follows the job's current project permission. No authenticated upload/update/delete policy.
- `research-artifacts`: 2 MB derivative files, allowed JSON/PDF/PNG/SVG/CSV. Upload path begins with authenticated user ID/run ID; current project access required. Metadata is published after upload. No authenticated update/delete policy. Maximum 128 metadata records per run.

`npm run test:database` executes all migrations unchanged in embedded PostgreSQL with minimal Auth/Storage fixture tables. It actually exercises SQL grants, RLS, RPC authorization, token redemption/revocation, optimistic versioning, immutability, storage policies, lease retry/fencing, cancellation and queue limits. It does **not** run Supabase Auth token issuance or Storage HTTP upload services. Those require the hosted/local two-user acceptance checklist.

For a full local Supabase stack install Docker and Supabase CLI, run `supabase start`, then `supabase db reset`. Seed SQL creates no fake accounts/passwords/public research; authenticated users save the four built-in starter networks. Hosted confirmation stays enabled according to project Auth settings; local development disables confirmation. Never expose the worker service-role JWT in a `NEXT_PUBLIC_` variable.
