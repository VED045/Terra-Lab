# TerraLab Phase 4A collaboration test plan

20 October 2026. **Hosted acceptance: PENDING.** Local SQL fixtures exercise four identities, but they do not issue real Auth JWTs, run Supabase Storage HTTP, or validate account lifecycle in independent browsers.

## Isolated identities and environment

Use a disposable staging Supabase project with migrations 001–004, private buckets, test-only API/worker/frontend, and no real research data. For the existing cloud project, do not rerun 001; determine the actual ledger before any change. Do not use the service credential for any user role test.

| Identity | Purpose | Independent session |
|---|---|---|
| A | Project owner | Dedicated browser profile/context and Auth session |
| B | Invited editor | Separate browser profile/context and JWT |
| V | Invited viewer | Separate browser profile/context and JWT |
| C | Unrelated outsider | Separate browser profile/context and JWT |

Three identities can be used by changing B between viewer/editor with fresh sign-ins; four keep the matrix unambiguous. Do not relabel one session as different people. Precreate/confirm these isolated accounts yourself through the supported registration flow. Keep emails/passwords/tokens in environment or provider secret storage, never report files/screenshots/chat.

Record commit/file digest, staging project ref, migration versions, frontend/API/worker version, timestamps, role/action outcomes and sanitized request status. Save only test-created IDs and redacted screenshots.

## Role/action contract

| Action | A owner | B editor | V viewer | C outsider / anonymous |
|---|---|---|---|---|
| List/read project and its revisions, runs, published chunks/exports | Allowed | Allowed | Allowed | Denied; no enumeration |
| Change/save/rename/archive/restore project, start experiment | Allowed | Allowed | Denied | Denied |
| Delete project without jobs/history | Allowed | Denied | Denied | Denied |
| Delete project with immutable history | Denied; archive | Denied | Denied | Denied |
| Manage members, invitations, project team assignment | Allowed | Denied | Denied | Denied |
| Manage team membership | Team owner only | Denied unless team owner | Denied | Denied |
| Cancel active job | Project owner | Own submitted job with current access | No unrelated-job mutation | Denied; former submitter denied after access removal |
| Append derived export | Allowed | Allowed | Allowed by existing contract | Denied |
| Modify/delete revision, run, derivative metadata/raw chunks | Denied | Denied | Denied | Denied |
| Claim/heartbeat/finalize raw worker run | Worker only | Worker only | Worker only | Denied |

Local `scripts/test-database.mjs` executes the SQL subset. UI hiding is not sufficient: repeat denied operations with the actual user's public-key/JWT client against REST/RPC and Storage HTTP.

## Hosted cases and exact expected evidence

### H01 — Authentication lifecycle

Register and confirm A/B/V/C; sign in independently. Refresh each browser; verify profile/status. Refresh an expiring access token through normal Auth behavior. Log out, refresh and test fresh server requests; replay an expired token against test-created data and confirm denial. Switch accounts in one deliberately shared test profile: record which already-downloaded local copies remain, and verify fresh cloud requests use the new account. Never infer denial from a stale UI badge.

### H02 — Owner persistence and revisions

A creates a uniquely named test network, saves revision 1, changes one receiver coordinate and saves revision 2. Reload browser and library; assert exact config/owner/revision. Star, copy, rename, archive/unarchive. Restore revision 1 using current expected version: obtain revision 3 and retain revisions 1/2 unchanged. Verify an empty-history throwaway can be deleted; a project with jobs is archived instead of hard-deleted.

### H03 — Supported invitation flow and role enforcement

In A's Research workspace → project Details → Sharing and ownership, create a viewer link for V and editor link for B. Open each link in its recipient's independent profile, sign in and accept using the supported invitation UI. Verify allowed data, then issue each denied action directly using that recipient's real JWT. C searches the library and probes known test project/revision/run IDs; results must not expose project names/config/history or permit mutation.

### H04 — Invitation lifecycle/scope

Test all five kinds: project/template/configuration/experiment/report. Create the required template/run targets first. Non-project editor grant must fail. An accepted report link grants viewer access to **the complete project's** history/export scope; verify it does not expose a different private project. Redeeming a valid link twice is allowed by the documented reusable-link contract. Existing editor rights must not be downgraded by a viewer link. Malformed/null/wrong-length/random tokens fail without disclosing targets. Expired links fail; shorten expiry only on a disposable staging fixture through an approved administrator action or wait for seven days. Revoke a fresh link and confirm redemption fails. An outsider cannot create/revoke links on A's project.

### H05 — Direct/team grant composition

A creates test team T and assigns its test project with the current expected version. Give C team-viewer access, confirm read but no edit/self-promotion. Give C direct editor access; confirm edit without owner rights. Remove direct access while the team grant exists: read remains. Remove final team access: all fresh project/revision/run/object requests fail. Ensure T cannot reveal another project not assigned to T. Team ownership must not become project ownership.

### H06 — Revocation in already-open sessions

With V's project/run screen open and a result already downloaded, A removes every direct/team grant. V's next refresh/REST query/download must fail or return no authorized rows. Repeat with a fresh V session. Remove B's access after B submits a queued job: B must not cancel it through API/RPC; A still can. Link revocation alone stops new redemptions but intentionally leaves existing membership intact. Record cached copies and in-flight request limitations; do not pretend their bytes can be recalled.

### H07 — Concurrent edits/conflict recovery

A and B independently load revision N. Change different coordinates in both without reloading. Save A: N+1. Save B with expected N: VERSION_CONFLICT; server config remains A's, B's unsaved state and undo history remain available. Save B as copy: a distinct private project is created with B's edits; original history stays intact. Repeat and choose reload only after the explicit discard warning. Exercise save response arriving while additional local edits are made, undo/redo after accepted versions, and restore-as-new-revision conflict against a peer's save. Shared access plus conflicts is not real-time synchronization.

### H08 — Autosave, UI states and account transitions

Test autosave while playing, when dialogs pause autosave, and after token expiry/network interruption. Verify errors retain editable data. Rename/archive an active dirty project without losing current geometry; undo stays usable. Cancel restoration if it would replace dirty edits. Check loading, empty, denied and expired-session screens on desktop/tablet/mobile and every palette. The serial local suite covers ordinary interactions; this case needs actual accounts and deployed staging.

### H09 — Real API/worker/Storage and exports

A runs a small seeded project (1 trial, no sweep, duration 0 initially). Record API idempotency key, job/run IDs, status/progress and immutable request/version. Duplicate identical submission returns the same job; changed body with that key conflicts. Read from B/V and deny C using the **same known existing** result/chunk URLs. A nonexistent-object 404 alone is insufficient evidence. For published chunks verify list policy, exact manifest paths, decoded byte count, SHA-256 and result ID. Unpublished/old-lease chunks must not appear in list/download even for collaborators. Cancel a run, inspect partial epochs/failures. Force upload failure only on staging; no completed manifest may appear. Export JSON/CSV/SVG/PNG/PDF/manifest from the stored run; inspect units/failures/labels and compare metrics. Edit/rerun workspace and verify original run bytes unchanged. Append a small derivative, verify all authorized readers and deny C. Fill a disposable run's derivative slots to 128; upload 129 must fail even without publishing metadata. Never perform quota/load exercises against production.

### H10 — Worker and database concurrency

Use an isolated staging queue. Run two true DB connections/users near global capacity and submit simultaneously: active jobs must not exceed 100; per-user active cap stays 4. Repeat duplicate-key submissions and simultaneous project saves. Run two worker processes: one lease at a time per job; kill the owner process, wait beyond 90 s, reclaim with fresh token, reject stale heartbeat/finalization. Verify retry limit, abandoned 24 h expiry, cancellation, failed jobs and atomic publication. Restart API/worker services through approved staging controls. This local audit simulates lease timestamps in SQL and real worker computation via fixtures; it does not substitute for these overlapping/provider tests.

### H11 — Production configuration gate

Follow `DEPLOYMENT_READINESS.md`. Verify migration ledger, private buckets/RLS, worker-only secret placement, exact CORS and redirects, TLS, backup restoration, orphan cleanup, readiness via an actual authenticated job and provider logs. Do not approve production solely from `/health` or a successful Next build.

## Supplied staging harness — review before execution

`scripts/test-hosted-acceptance.mjs` provides a real-Auth/PostgREST subset using independent SDK sessions. It creates/deletes only newly generated test projects and leaves users themselves untouched. It rejects the existing user project ref and requires an explicit staging reference plus mutation opt-in. It does not claim complete H01–H11 or a positive published-object Storage test.

Required environment names (set through a secure local mechanism; no credential values are supplied here):

```text
TERRALAB_ACCEPTANCE_URL
TERRALAB_ACCEPTANCE_PUBLIC_KEY
TERRALAB_ACCEPTANCE_STAGING_REF
TERRALAB_ACCEPTANCE_OWNER_EMAIL / TERRALAB_ACCEPTANCE_OWNER_PASSWORD
TERRALAB_ACCEPTANCE_EDITOR_EMAIL / TERRALAB_ACCEPTANCE_EDITOR_PASSWORD
TERRALAB_ACCEPTANCE_VIEWER_EMAIL / TERRALAB_ACCEPTANCE_VIEWER_PASSWORD
TERRALAB_ACCEPTANCE_OUTSIDER_EMAIL / TERRALAB_ACCEPTANCE_OUTSIDER_PASSWORD
TERRALAB_ACCEPTANCE_ALLOW_MUTATIONS=1
```

After the user explicitly approves that exact staging target and test-project create/delete scope, execute from the repository:

```powershell
node scripts/test-hosted-acceptance.mjs
```

Missing prerequisites produce PENDING/exit 2; assertions fail with exit 1; cleanup failure identifies only test-created project UUIDs. Never replace the public key with service-role credentials. Only syntax validation (`node --check`) was executed in this audit. Automatic approval review blocked execution because the exact external target/mutation scope was unapproved; no workaround was used. Complete UI, team, shared-run, valid Storage download and worker-restart steps remain manual staging acceptance.
