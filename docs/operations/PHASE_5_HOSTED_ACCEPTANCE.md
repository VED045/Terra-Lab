# Phase 5 hosted acceptance and operations gate

Status: not executed. The user has a live Vercel/Render installation and reports Supabase migrations through 004. No separate staging target or isolated test accounts were supplied. Public reachability, local fixture tests and a successful push do not establish hosted acceptance.

## Safe acceptance scope

Use a separate test copy of the frontend/API/Supabase database, or an explicitly approved bounded test scope on the live installation. Record exact destinations and accounts before mutations. Never reuse another person's research or publish privileged keys. Staging means a disposable test copy; it is not a feature required for ordinary TerraLab use.

1. Confirm deployed Git revisions, migration definitions/ledger and exact CORS/Auth redirects; verify backup recovery before schema changes.
2. Use independent owner, editor, viewer and unrelated sessions. Exercise invitations, expiry, revocation, direct/team precedence, stale saves and explicit conflict reapply. Known existing private result/artifact paths must succeed for authorized users and fail for unrelated/revoked users.
3. Submit a small synthetic experiment and reopen it through the frontend. Verify request/manifest/chunk hashes, immutable results, counts and failure accounting. API health alone does not establish that the numerical worker processed a job.
4. Exercise Render cold starts, cancellation, controlled worker restart/lease expiry and publication retry using only test jobs. Verify no duplicate publication and no exposure of unpublished chunks.
5. Observe queue depth, duration/failure/retry rates and process resources under realistic bounded load before increasing any cap. Keep per-user/project aggregates private and privileged global operations separate from browser data.
6. Review sanitized logs and real resource utilization; record pass/fail evidence and remaining limits. Do not advertise production acceptance from fixture tests.

Operational expansion (automated retention/deletion, resource-limit changes or recovery drills on live data) remains gated on this acceptance. No hosted reset, cleanup, migration or configuration mutation was performed in this Phase 5 implementation.
