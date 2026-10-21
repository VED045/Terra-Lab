# Collaboration verification

## Automated commands and boundaries

- npm test: existing unit/science/API regression assertions.
- npm run typecheck and npm run build: TypeScript and production route build.
- npm run test:database: all unmodified versioned SQL migrations and existing project/job/history/storage RLS checks in PGlite.
- npm run test:collaboration: new real PostgreSQL lifecycle, cross-account/RLS, exact discovery, rate limit, duplicates, owner protection, replay, expiry, notification privacy and atomic invitation-batch checks.
- npm run test:python: scientific API/worker regression suite.
- npm run test:worker and npm run test:combined: actual Python workers against local PostgreSQL plus test-only Auth/Storage protocol fixtures.
- npm run test:e2e: existing complete browser/scientific regression suite with isolated local services.
- npm run test:e2e:auth: existing owner/editor/viewer stale-save/3D checks plus the new four-session collaboration browser workflow.

The new browser test uses separate owner, requester, second peer and outsider contexts. Browser actions run the actual page, RPC SQL and RLS. The only substituted layer is Supabase Auth/PostgREST transport. It verifies request review and role override, pending/resolved requester status, rejection without access, project-only versus studio inheritance, invitation review/acceptance, outsider isolation, direct revocation with remaining studio access, notification read state, 390px layout and keyboard navigation. Screenshots are retained by Playwright. All fixture identities/data live in test code only. Production has no fake users, grants or notification data.

PGlite executes real PostgreSQL but serializes calls and uses minimal auth/storage fixture schemas. It does not prove hosted Auth refresh, actual PostgREST exposure, realtime delivery, hosted storage HTTP, multi-connection row-lock contention or email identity verification. Existing skipped tests remain reported; none were weakened or newly skipped. See VERIFICATION.md for actual run results.

## Hosted acceptance — pending, no production writes authorized

Prerequisites: an isolated disposable staging project with every migration installed by an authorized operator, a staging frontend pointing to its public URL/key, and at least two verified accounts (preferably owner, viewer, editor and outsider) in separate browser profiles. No staging test-account credentials were supplied for this task. The existing hosted script explicitly excludes the user's existing project and must not be pointed at production. Do not print credentials or use a service-role key in a browser.

1. Owner signs in; create workspace “Staging studio”; People → save owner username/name, enable discovery and exact-email lookup, select that studio. Each peer creates a distinct discoverable profile. Outsider stays undiscoverable. Verify username uniqueness, exact verified email, prefix/wildcard rejection and no direct profile directory access through PostgREST.
2. Save two cloud projects with recognizable private names. Assign only one to Staging studio through Manage access. Record expected version. Verify studio invitation/request previews expose no unapproved private project name/configuration.
3. Requester finds owner, chooses Viewer, enters a message, reviews and sends. Repeat the send in another tab. Verify exactly one pending request/notification and no projects visible before approval.
4. Owner reviews and explicitly approves Editor. Requester refreshes: sees accepted, requested Viewer, approved Editor; can open/edit/run only the assigned project. They cannot grant/share/delete it. The other private project must remain unavailable even by direct REST ID.
5. A different peer submits a request; owner rejects it. Confirm resolved rejection and no grants/history/storage access. Repeat with requester withdrawal. Try invalid roles/self-requests and outsider item IDs.
6. Owner invites requester to the private project as Viewer through the reviewed in-app flow. No email should be claimed. Accept in requester profile; verify project-only direct membership and full read/export history, no new studio membership. Repeat with a studio/team offer to the other peer and verify assigned-project inheritance only.
7. Exercise reject, revoke, expire (operator can set a staging row past expiry), renew, and resend. Attempt acceptance in an outsider profile and repeated token/ID decisions. Verify reusable legacy project/configuration/template/experiment/report links retain their documented viewer/full-project behavior.
8. In two independent owner tabs, accept and reject the same pending request simultaneously. Query final membership and status as each user: exactly one outcome; the loser gets a conflict or the same no-op outcome. Repeat recipient acceptance against owner invitation revocation and duplicate batch sends. Inspect PostgreSQL locks/deadlock logs; verify no unbounded wait and no partial grants/events. This multi-connection check is pending locally because no native PostgreSQL/Docker instance is installed.
9. Change direct and team roles; verify highest effective role. Remove direct grant while a team grant exists (access remains), then remove the final grant (future project/history/job/result/export/activity requests deny). Replay accepted request/invitation IDs and verify no grant reappears. Revoke reusable links separately.
10. As each account, read another user's notification ID through REST and try changing recipient/event fields: denied/no rows. Mark one/all own notifications read, repeat requests and renewals; verify no duplicate notification per lifecycle event. Refresh/logout/login and confirm read state persists and account switching clears previous UI data.
11. Test stale saves from two editor tabs (PT409 and conflict recovery), immutable experiment history, jobs, reports/CSV/JSON/image exports, 2D interactions and optional 3D. Run existing automated suites against local code as well.
12. At 390px, tablet and desktop, navigate all five sections; use Tab/Shift+Tab/Enter/Escape with visible focus; verify Radix dialog focus returns, no nested dialogs, no horizontal overflow, and dark/light/additional palette tokens match the editor. Disable network to verify error/retry states; revoke a selected resource while its page is open and verify subsequent Open/save fails.

Capture staging URLs, migration list, accounts by role (no passwords), browser evidence and SQL assertions. Obtain explicit approval before any public deployment or production migration. Until these hosted steps are completed, report hosted acceptance as pending.
