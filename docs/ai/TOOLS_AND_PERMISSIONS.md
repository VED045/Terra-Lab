# TerraLab AI tools and permissions

Phase 3 adds six tools to the fourteen-tool Phase 2 catalogue below. The five testing tools are advertised only on an explicitly enabled local development server; the server independently rejects their use elsewhere. `propose_parameter_study` is available to editors/owners under the same scientific approval/queue boundary as experiments.

| Added tool                | Scope and result                                                                                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inspect_test_commands`   | Local operator only; actual fixed command IDs, invocations, source hash, resource/network policy and isolation disclosure.                                                       |
| `inspect_changes`         | Local operator only; bounded changed paths and revision, heuristic relevant-test selection and explicit no-patch policy. No source/environment file bodies.                      |
| `propose_test_run`        | Local operator only; reviewed exact command ID and fresh source hash. No arbitrary argv, cwd, shell string or environment input.                                                 |
| `inspect_test_run`        | Local operator only, selected project; actual state/times/exit code/counts/revision and up to 12 KB of retained diagnostic output. Unknown counts are null.                      |
| `propose_cancel_test`     | Local operator only; exact active test job and process-tree cancellation consequences for review.                                                                                |
| `propose_parameter_study` | Editor/owner; two to five values for one actual supported sweep, explicit target metric/trials/seed, validated workload and human-reviewed existing experiment queue submission. |

The local inference budget is now 180 seconds; hosted remains 45 seconds under the existing 60-second deployed route cap. Six steps/twelve tools and existing output/work bounds remain. The free local profile rejects hosted keys and remote-backed Ollama model tags/metadata; its dedicated Ollama process also disables cloud inference. Test execution is a separately limited local process because the existing scientific queue does not run general repository commands. It is not a second scientific queue or a production command service. See [TEST_PLAN.md](TEST_PLAN.md) for the exact discovered catalogue and [SECURITY_AND_LIMITS.md](SECURITY_AND_LIMITS.md) for the local-trust limitation.

Phase 2 extends the preserved Phase 1 explanation mode with a bounded research-agent loop. No shell, code interpreter, SQL, unrestricted HTTP client, filesystem or browser tool is exposed to the model. The existing scientific solvers and queue execute numerical work.

## Authority and execution

Every known tool parses a strict Zod schema, re-verifies the Supabase user, re-reads the selected project through its RLS context, and determines current direct/team permissions. Viewer tool definitions omit all `propose_*` tools; the server independently rejects viewer write preparation and approval. A later permission downgrade or revocation blocks an already prepared proposal. The final cloud save uses the existing `save_research_project` RPC with the expected revision; queue submission/cancellation uses the existing scientific API and its checked database operations. No service credential is used by the agent.

Explicit loopback development is single-user and accepts a validated local project snapshot, as Phase 1 already documented. It is disabled in production and never an invalid-JWT fallback. The browser must perform its existing `localSave` after a server-approved local change; the server labels this `local_save_required`, not completed. Before replacing a local saved snapshot, the UI stores a private recovery copy using `freshCopy`/`localSave`. Cloud writes retain existing revisions. Unsaved editor drafts are not overwritten. The model never directly changes Zustand state; the human-operated bridge loads validated saved snapshots through the existing store API.

## Tool catalogue

| Tool                       | Role                | Result / boundary                                                                                                                                                              |
| -------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `inspect_project`          | Viewer/editor/owner | Selected project ID/revision, role, counts, actual extent, permitted coordinate bounds, simulation and laboratory configuration; excludes descriptions and private identities. |
| `inspect_entities`         | All                 | Up to 50 selected validated entities; names/prose omitted. Supports anchors, receivers, obstacles and trajectories, including mobility properties.                             |
| `inspect_parameters`       | All                 | Actual defaults, allowed values, units, current values, source references and qualified interpretations; unsupported parameters fail explicitly.                               |
| `diagnose_geometry`        | All                 | Existing calibrated-range solver at t=0, usable/blocked links, conditioning, residual RMS and warnings; explicitly not a new laboratory run.                                   |
| `list_runs`                | All                 | Selected-project job history, real status/progress, latest first; at most 50 metadata entries.                                                                                 |
| `inspect_run`              | All                 | Actual selected/latest run, progress, bounded metrics/observations/residual samples and result link.                                                                           |
| `compare_runs`             | All                 | One to four actual runs; recorded metrics, sample counts, scientific pairing/compatibility warnings and observation-hash references. One run can compare its estimators.       |
| `list_revisions`           | All                 | Up to 30 selected-project revision numbers/times; no author identity disclosure. Local projects use recovery copies and receipts.                                              |
| `propose_network_changes`  | Editor/owner        | Atomic draft of up to 50 add/update/delete operations; strict existing entity schemas and whole-project validation. No write before review.                                    |
| `propose_parameter_change` | Editor/owner        | Validated laboratory/simulation configuration draft; rejects invented controls and unsupported values.                                                                         |
| `propose_scenario_copy`    | Editor/owner        | A private new project ID/configuration, preserving original ownership/grants; requires review.                                                                                 |
| `propose_experiment`       | Editor/owner        | Actual validated configuration, workload, diagnostics and review; not a successful result or submitted job yet.                                                                |
| `propose_cancel_run`       | Editor/owner        | Exact active run and cancellation consequences for review; terminal jobs are not relabeled cancelled.                                                                          |
| `export_run`               | All                 | Authorizes a terminal run's real JSON/CSV export. The authenticated download endpoint uses the existing `experimentCsv` conversion and actual snapshot.                        |

## Approval, stale state and recovery

Mutations are never executed by a model call. Preparation returns a ten-minute HMAC-signed token bound to user ID, project ID and a canonical configuration/revision fingerprint. The token is delivered only to the UI and omitted from model tool results. The user sees the exact draft, deletions, path-reference consequences, chosen defaults and workload. Shared-project and destructive operations are labeled. All experiment submissions require approval, including small ones; large workloads are highlighted.

Approval verifies origin, identity, role, signature, expiry and current fingerprint again. A changed revision requires a new preview; no silent rebasing occurs. Existing cloud RPCs enforce database-side authority again. Experiment action IDs become the existing idempotency key. Used proposals are rejected within the current process. Cloud revision/idempotency checks remain the final protection across instances; local tokens use a process-specific key, so a restart invalidates outstanding approvals. Receipt loss does not erase cloud revisions or local recovery copies.

Undo/redo is a reviewed restore of the prior validated snapshot against the current fingerprint, producing another saved revision and reverse receipt. It does not rewrite immutable history. Deleting a trajectory sets dependent receivers to stationary with a null trajectory reference, matching the existing editor operation. A browser storage failure leaves the original snapshot/recovery data intact where the existing storage write is atomic and reports failure; no completed edit is claimed.

The local bridge also re-reads persisted browser state before saving and rejects a changed snapshot. Existing localStorage writes are not a cross-tab database transaction; use the explicit development mode as a single-tab, single-operator workspace. Cloud projects retain the existing atomic revision/RPC guarantee. The AI does not claim that an in-memory receipt upgrades browser storage to a collaborative transactional database.

## Limits and cancellation

- Six model steps, twelve tool calls, 45-second provider/tool signal budget and the existing 60-second route cap.
- At most 32,000 text-output characters and 22,000 characters per model-visible tool result. Oversized reads return a structured request to narrow scope.
- Existing 500-object network schema; existing scientific API's smaller 100-object laboratory limit is checked before submission. AI runs cap work at 20,000 estimator epochs and 100,000 anchor observations.
- Sixty tool, approval, export, agent-start and compatibility-check operations per user per minute per process, with a bounded identity map. Existing persistent queue limits enforce four active jobs/user and the existing global cap. The AI additionally rejects four active jobs in the selected project. The AI request limiter is not an account-wide distributed rate service.
- Stop aborts the agent stream and future/in-flight tool reads through AbortSignal. No model-generated write is executing inside that stream. Already submitted jobs are separately tracked; **Cancel active run** prepares the explicit worker cancellation review. Terminal states, partial counts and failure remain visible.

Unknown tools, invalid schemas and unsupported provider formats produce structured errors. The model can recover within the step budget; unsafe values are not silently clamped or coerced. The provider never changes automatically.

## Data minimization and audit

Descriptions, names, collaboration profiles and unrelated project rows are excluded from model context. Numeric entity properties and current-project observation samples are exposed only when requested. Imported/project/result strings remain untrusted data and are never system instructions. Credentials stay in the existing encrypted mechanism, are excluded from prompts/results, and are scrubbed from text/tool payloads. There is no coding-agent wrapper around OpenCode or Harness.

Each executed/failed allowlisted tool emits structured server audit metadata: verified actor/project references, tool name, state, a trusted bounded status summary and timestamp. Human approval outcomes are audited too. Raw arguments, prompts, credentials, provider bodies and arbitrary result prose are not logged. This uses the hosting log sink; read events are not added to research data tables. Cloud domain writes additionally retain their existing revision/activity/job records. External log retention and distributed admission remain operator concerns.

The only new scientific API operation is additive `GET /experiments?project_id=<uuid>` for bounded metadata history. Local reads examine at most 50 stored files under the existing data directory with a 25 MB cumulative file budget, plus live in-memory jobs; cloud reads use caller JWT/RLS. It does not expose arbitrary paths or replace the detail, submission, worker or solver APIs.
