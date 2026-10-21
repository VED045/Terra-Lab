# Collaboration center

Open **Collaboration** from the main Projects navigation or the studio navigation rail. The dedicated route is /collaboration. All peer discovery, requests, offers, notifications and permission management live here. Project details and the legacy Teams view link to this central surface. Scientific editing, job execution, exports, template creation, comparisons and revision recovery remain in their existing locations.

The five sections are Overview, People, Requests & Invitations, Shared with me, and Manage access. Navigation wraps on mobile and uses native keyboard-focusable buttons with visible focus. Request and invitation dialogs use the existing Radix dialog, including focus trapping and Escape handling. Counts derive from the authenticated database snapshot; there are no demo people or notifications. Refresh and returning browser focus revalidate that snapshot. There is no background polling or paid notification service.

People contains an opt-in profile (unique lowercase username, chosen display name, optional verified exact-email lookup). Discovery returns only the exact peer's name, username and offered studio. Self-search returns no peer. There is no list, wildcard or prefix endpoint. Email is never returned; lookup is capped at 60 per authenticated user per hour. Opting out prevents discovery but does not hide identity from existing authorized collaboration participants.

A studio is an existing owned team workspace designated in the profile. It is not every personal project. Owners create a workspace in Manage access, designate it in People, then explicitly assign chosen projects. This uses the existing team role model and RLS; no second role system or studio membership table is introduced.

Shared with me uses the same database authorization helper as project reads. It shows effective role, owner, independent access sources, resource timestamps, search, sorting and explicit Open actions. Workspace cards open the included project list; opening a project fetches its config again under current RLS before entering the studio. Overview recent resources are sorted by resource update/creation time, since legacy memberships have no grant timestamp.

Notifications are persistent, recipient-only records. Their previews contain generic event names, item references and timestamps, never project names, configurations, emails or tokens. Mark one or all as read. Open item navigates to the request, offer or management view; a resource whose grant was removed remains unavailable. The latest 100 notifications are displayed, with an accurate all-record unread count. Existing immutable project_activity supplies the authorized activity feed.

No new runtime dependencies, paid providers, hosting changes, public deployments or hosted migrations are required for the source changes. See ACCESS_MODEL.md, REQUESTS_AND_INVITATIONS.md and TEST_PLAN.md. The pre-implementation audit is in AUDIT_AND_PLAN.md.

Meaningful existing activity (new revisions, published results, archive/restore and workspace assignment changes) also creates generic shared-project notifications for current direct/team grantees and owners, excluding the actor. The immutable activity record ID supplies idempotency. Identical save retries create neither a new revision nor another notification; removed grantees receive no subsequent update events.
