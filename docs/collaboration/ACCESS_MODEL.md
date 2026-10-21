# Access model and security

## Authority and scope

The existing private.project_role remains the sole project authority. Owner outranks editor, editor outranks viewer. An editor direct grant, team editor membership or team ownership takes precedence over a viewer grant. Project ownership is immutable through collaboration operations. Team ownership gives editor capability to an assigned project, never project ownership.

| Scope | Grant storage | Included resources | Manager |
| --- | --- | --- | --- |
| Project | project_members | One project, revisions, experiments, recorded activity and authorized export objects | Project owner |
| Studio | team_members on the profile-designated owned team | Only explicitly assigned projects, including future assignments | Team/studio owner |
| Team | team_members | Only projects assigned to that team | Team owner |

Viewers inspect and export; editors also save versions and start scientific jobs. Neither can invite, grant, delete projects or transfer ownership. There is no invented administrator role. Only existing owners can approve requests, offer invitations, change roles, assign projects or remove members. Owner rows cannot be added, downgraded or removed through the membership RPCs. Project-level approval never creates team membership.

## Enforcement

All actors derive from auth.uid(). The new peer, request and notification tables have RLS and explicit grants. Profile rows are directly readable only by their owner. Exact discovery and authorized participant names are returned through checked RPCs; arbitrary directory reads are unavailable. Requests are readable by their requester and recipient only. Notification SELECT and read-state UPDATE are recipient-only; clients cannot insert events or change recipients, event text or timestamps other than their own read_at.

share_links continues to store token hashes only. Recipient offers are exposed through a filtered snapshot that excludes token hashes, raw auth emails and project configuration. Pending offers show a generic private-resource label until existing independent authorization permits the resource name. The original owner-only share_links SELECT policy remains, so recipients cannot inspect the raw invitation table. Anonymous roles have no new RPC execution grants. Definer functions pin an empty search_path; private helpers and trigger functions have no client execution privilege. The narrowly scoped public definer entry points follow this repository's established checked-RPC architecture.

Mutation transactions acquire resource rows before request/invitation rows, providing a consistent lock order for decisions, grants, withdrawals, renewal and revocation. A partial unique index allows at most one pending request per requester/studio and one unresolved targeted invitation per recipient/resource. Opposing resolved decisions fail with PT409; the same decision is a no-op. Acceptance inserts the appropriate existing membership and resolves the item in the same transaction. Accepted-item replay after membership removal never restores the grant. An approval preserves any stronger existing editor grant; a deliberate downgrade uses Manage access instead.

Notifications are created in the same transactions as requests, invitations and grant changes. Unique event keys and unchanged-role guards deduplicate retries. Renewal is limited to once per day for idempotent in-app refresh, since no email delivery is involved. Live multi-connection lock contention still requires staging validation; the local PGlite fixture serializes database calls.

## Revocation limits

Deleting a direct grant revokes only that grant. Team membership, team ownership or another direct grant may preserve access. The management view displays inherited sources and requires changing them at the team. Removing team membership immediately affects future RLS reads of assigned projects, history, jobs and storage metadata. The server checks every subsequent mutation; stale browser state does not confer authority.

Revoking an invitation blocks future redemption. It does not erase a previously accepted membership: explicitly remove membership as well. Reusable legacy invitation links may permit a new grant after member removal unless separately revoked. Data already downloaded, cached locally, exported or copied cannot be recalled. No changes are made to immutable runs, export objects, revision history or conflict handling.

## Migration and rollback

The additive migration is 20261021064834_collaboration_center.sql, generated using the Supabase CLI. It adds peer_profiles, access_requests, collaboration_notifications, a private lookup-rate table, new invitation fields/indexes/constraints and checked RPCs/triggers. Studio membership reuses teams/team_members. No existing data is reset, dropped or backfilled into notifications. project_id becomes nullable only for recipient-bound team/studio offers; a constraint enforces exactly one scope. Existing project link kinds and redemption semantics remain compatible. The project-activity invitation trigger is replaced with a scope-aware equivalent because team invitations have no project ID.

Apply all prior migrations first. Test against an isolated staging project, review database advisors and the permission/concurrency checklist, then obtain explicit operator approval before hosted application. No hosted migration has been applied by this task.

Preferred rollback is to revert the UI/application release while retaining this additive schema and recorded data. Legacy project links, project/team reads and science RPCs remain compatible. Do not delete newly recorded requests, memberships or notifications to roll back a UI. A full schema reversal requires a separately reviewed data-retention/export plan, removal of team/studio offers before restoring project_id NOT NULL, restoration of the previous functions and activity trigger, then removal of new objects in dependency order. Never run a blanket reset or drop on production. Existing grants created by acceptance must be reviewed explicitly, not silently revoked by schema rollback.

Meaningful existing activity (new revisions, published results, archive/restore and workspace assignment changes) also creates generic shared-project notifications for current direct/team grantees and owners, excluding the actor. The immutable activity record ID supplies idempotency. Identical save retries create neither a new revision nor another notification; removed grantees receive no subsequent update events.
