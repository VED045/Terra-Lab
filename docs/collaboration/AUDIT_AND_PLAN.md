# Collaboration audit and implementation plan

Audit performed against the existing repository before implementation, 21 October 2026.

| Feature | Classification before upgrade | Evidence / action |
| --- | --- | --- |
| Project viewer/editor/owner and direct/team grants | Complete for existing scope | private.project_role; checked manage_* RPCs; RLS; actual SQL tests. Preserve strongest effective grant. Add owner membership guards. |
| Reusable project invitation tokens | Complete for existing link workflow | share_links; hashed tokens, seven day expiry, redemption, revoke; reusable links intentionally do not revoke prior grants. Extend same table for recipient-bound studio/team/project invitations. |
| Shared projects and teams | Complete, UI incomplete | workspaceIndex/RLS; central page adds effective role/source and search. |
| Team membership | Complete, UI incomplete | teams/team_members; owner-only mutations; central management replaces raw UUID controls. |
| Peer discovery | Missing | Account display names are not unique identities. Add opt-in exact unique username/email lookup with throttling, no searchable directory. |
| Studio membership | Missing as separate concept | Reuse existing teams; optional profile studio_team_id designates one owned team as studio. Only assigned projects inherit access. No implicit sharing of all personal projects. |
| Access requests | Missing | Add requests only, using existing team grants on acceptance. Row lock and pending uniqueness; recipient is team owner. |
| Persistent in-app notifications | Missing | Add recipient-only records with unique event keys; trigger creation in same transactions as existing grants. No metadata in previews. |
| Recorded project activity | Complete | project_activity immutable trigger records, current-project-access RLS. Reuse authorized recent activity. |
| Revocation | Complete for future requests | Project/team grant removal immediately affects RLS. Independent grants remain; downloaded copies cannot be recalled. |
| Revision conflicts / immutable experiment history | Complete | Locked expected-version RPCs, PT409 business conflicts, append-only runs/artifacts. Preserve. |
| Dedicated collaboration navigation | Missing | Add /collaboration and one consistent navigation entry. Consolidate raw member/invitation management into that page; preserve legacy snapshot/link sharing there. |

Implementation order: (1) additive migration and real PostgreSQL security/lifecycle tests; (2) typed central page and compact responsive navigation; (3) browser workflows using independent local test identities with real SQL authorization, clearly distinguished from hosted acceptance; (4) regression suites, build, documentation and security review. No new runtime dependencies, providers, paid services, push, hosted migrations or deployment.

Compatibility: legacy reusable links retain their existing meaning. New recipient invitations are single-decision, recipient-bound, seven-day offers. Expiry/revocation of an invitation never silently removes accepted direct/team grants; explicit membership removal does. Request approval cannot transfer ownership or weaken an existing editor grant. New tables need RLS and least-privilege grants; all actor identity derives from auth.uid().

Baseline: unit 194 pass / 1 existing skip; database 60 checks pass; Python 207 pass with one existing Starlette deprecation warning. Browser baseline in progress.
