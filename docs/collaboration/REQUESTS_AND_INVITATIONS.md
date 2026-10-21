# Requests and invitations

## Request studio access

1. Owner creates an existing team workspace in Manage access, sets it as their studio in People, and opts into discovery. Assign projects explicitly to that workspace.
2. Requester searches an exact username or permitted verified email in People, reviews the peer profile, selects Request studio access, chooses Viewer or Editor and optionally enters up to 500 characters.
3. Review confirms the recipient, studio, role and inherited project scope. Send creates only a pending request. Retrying returns the existing pending item without a second notification.
4. Owner sees the pending count and received item in Collaboration. Review & accept shows the full scope and an explicit approved-role selector. Confirm grants that role atomically through team_members. Reject grants nothing. The requester can withdraw while pending.
5. Both parties see the final status. Requested and approved roles are distinct; a different approved role requires explicit selection/confirmation. A resolved request cannot be decided again in the opposite direction. A retry of the original decision does not recreate a removed grant.

Rejected/withdrawn requests can be renewed by submitting a new reviewed request. Existing studio members cannot submit redundant requests. Self-requests, invalid roles and requests to undiscoverable/unoffered studios are denied on the server. A profile can designate only a team it owns.

## Offer access

Invite people is inside Collaboration. Choose an owned project, studio or team; find and add one or more opted-in peers (maximum 20); choose a role and optional message; review all recipients and the exact scope, then send. The server authorizes the owner again, validates every peer and creates the whole batch in one transaction. One ineligible recipient aborts the batch. Duplicate pending offers are not sent twice. Existing direct members are managed through role changes rather than redundant offers.

No email is sent. Offers appear in Sent invitations and each recipient's Received invitations with persistent private notifications. The invitation is a recipient-bound row in the existing share_links token system, with seven-day expiry. Accept or Reject is recipient-only. Acceptance does not replace stronger existing access. Owners can Revoke pending offers and Renew expired offers. Resend on an active offer is an in-app renewal only; renewals within a day are no-ops to avoid duplicate retry notifications. Create a new offer after a rejection/revocation rather than reactivating the resolved item. Resolved items remain in history.

## Existing reusable links

Manage access → select an owned project → Reusable project and research invitation links preserves project, configuration, template, saved experiment and report kinds. Target selection uses existing saved resources. A link kind other than project remains viewer-only. All legacy links grant project-level access, including history and exports; they are not artifact-only isolation. The UI describes this existing behavior explicitly. Tokens remain random, hashed at rest and seven-day expiring. They are displayed only when created, never recovered from the database.

Use Requests & Invitations → Accept an invitation link to redeem a trusted link, or open /collaboration#invite=TOKEN. Legacy /#invite=TOKEN links remain supported through the existing dashboard's contextual review link. Signed-out recipients can sign in before accepting. Expired, invalid and revoked links fail. Legacy reusable links intentionally remain reusable until revoked/expired. Targeted offers use a single resolved decision and validate the recipient even if a token is supplied.

Sent pending reusable links are visible with a Revoke action. For accepted recipients, remove direct/project or studio/team membership in Manage access as a separate action. Revocation cannot recall downloaded copies.
