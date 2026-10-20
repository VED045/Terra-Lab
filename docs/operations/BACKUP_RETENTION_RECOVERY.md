# Backup, retention and recovery procedure

Planning procedure; destructive operations have not been implemented or executed. Apply only after hosted acceptance and an approved retention policy.

- Inventory projects/revisions, immutable run manifests and every referenced raw chunk before considering any deletion. Include derived artifact metadata plus uploaded objects without metadata. Never infer an orphan only from file age or an empty client index.
- Agree retention periods, legal/research preservation needs, project/account quotas, grace periods and accountable operator. Keep published immutable results by default. Archive a project without deleting its historical runs.
- Run a read-only inventory/dry run on staging. Emit counts, bytes, age ranges and candidate paths to a restricted operator artifact; do not log credentials or raw research payloads. Reconcile database and Storage references twice, immediately before any approved deletion. Lease/attempt state must rule out an active uploader.
- Deletion must be bounded and idempotent, scoped to reviewed candidate identities, and recoverable from a verified backup. Do not combine listing and deletion into an unreviewed wildcard command. Rate-limit cleanup and retain a privacy-safe operator record.
- Back up schema/data and separately back up Storage bytes. Record backup timestamps, compatible application/migration versions and checksums. Protect Auth references and key material outside public artifacts.
- Restore into an isolated target first; verify users/roles, private buckets/policies, project/revision counts, known chunk hashes, representative exports and an authenticated test job. A successful database restore without Storage is incomplete.
- Test recovery times and data-loss windows against agreed objectives before promising RTO/RPO. For application failures use the last compatible release; do not roll back to weaker access policies. Prefer reviewed forward fixes for schema defects.
- Recorded activity is append-only to application roles. Any future retention of that table needs a separately reviewed privileged procedure and privacy policy; ordinary users cannot erase its rows.

## Phase 5 migrations and rollback

005 expands project format support from v1 to v1/v2 and validates optional physical dimensions. It updates matching table checks and the existing versioned save RPC, without rewriting old projects, revisions or runs. 006 adds transactional recorded-activity references, private read policy and triggers; no tokens or configs are logged and no history is backfilled.

Review and apply each missing migration once, in filename order, in an explicit transaction after verifying target, ledger/definitions and recoverable backups. Stop on failure. Do not rerun 001–004 if already installed. Application use of physical dimensions requires 005; activity needs 006. Other schema-v1 features retain the existing contracts when these migrations are not yet installed, with actionable error states for unavailable new features.

Before any v2 project is saved, a reviewed rollback can restore old RPC/check definitions if no v2 rows exist. After v2 data exists, reverting table checks or deploying an older v1-only client would reject legitimate data. Keep 005 and use a compatible forward fix; export/back up v2 objects before any separately approved conversion. Never drop the new fields to make an old client accept a project. 006 can stop producing events by disabling only its reviewed triggers during an incident; preserve its existing history and RLS rather than deleting the table. No rollback or migration was run on hosting here.
