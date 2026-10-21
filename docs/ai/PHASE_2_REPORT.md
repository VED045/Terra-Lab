# TerraLab AI — Phase 2 report

Verified locally on 21 October 2026 in `C:\Users\Ved\Desktop\TerraLab`, on branch `codex/ai-simulator-phase-2`, based on Phase 1 commit `b2a0aaf3c66a89caba2f24cca04b736ce57b3aa8`.

Phase 2 implements a bounded simulator research agent, reviewed changes, real experiment submission/results, comparisons and scientific parameter explanations. All six requested domain workflows have been exercised through actual application routes and the existing numerical engine. Live model inference and model-quality acceptance are **deferred at the user's explicit request** until a supported provider is configured. The deterministic model fixture verifies protocol/orchestration, not live model intelligence.

Phase 1 is already pushed to `origin/codex/ai-studio-phase-1`; `git ls-remote origin refs/heads/codex/ai-studio-phase-1` returned the exact base commit above. Phase 2 remains local. No Phase 2 push, deployment, production database change, migration, dependency addition or Phase 3 execution agent was performed.

## Implemented behavior

AI Studio now defaults to Research agent, with the original streamed explanation mode still available. The agent presents a proposed plan and a tool timeline with safe argument summaries and structured real results. Fourteen typed tools inspect the active network, parameter schema, geometry, revisions and runs; prepare network/parameter/copy/run/cancellation proposals; compare actual records; and authorize real JSON/CSV exports.

The provider loop is independent of the domain tools. It uses native DeepSeek Chat Completions or native Ollama tool calling, requires formal initial project inspection, and stops at a proposal for human review. Compatibility checks issue both a formal tool-call probe and a structured-JSON probe; missing or incompatible local models produce actionable errors. No new agent framework or general-purpose Harness tools are embedded.

The review shows validated entity properties/defaults, a placement preview, exact deletions and consequences, experiment configuration/workload, shared/destructive labels and expiry. Approval is signed and bound to actor, selected project and current configuration/revision. It rechecks authentication, role and fresh state. Cloud saves use the existing expected-version RPC, and experiments use the existing queue/API/idempotency path. Submission returns the actual run ID without implying completion.

Approved local edits save through the existing browser domain persistence and retain a before-change recovery copy. Reviewed undo/redo restores validated snapshots with a reverse receipt. The UI links to saved entities and runs, polls real progress, preserves actual failed/cancelled states, supports separately reviewed worker cancellation, and downloads actual terminal results. Completed local experiments are saved through the existing IndexedDB history mechanism.

Parameter guidance reads actual defaults, ranges, units and current values from the shared metadata/schema. The reference documents 35 numeric laboratory controls and 23 entity/mobility controls, including signed clock/calibration effects, shared-reference TDOA covariance, robust/filter tuning, motion sampling, and the limits of the approximate NLOS/link-budget model. Source facts, mathematical mechanisms and uncertain accuracy effects are distinguished. Unsupported controls fail explicitly.

## Real workflow evidence

`npx playwright test --config playwright.ai.config.ts` starts an isolated Next server, a labeled deterministic model protocol fixture, and the actual FastAPI scientific service/worker. It never substitutes a mocked numerical result or a fabricated successful final answer.

| Workflow                       | Exercised operation and evidence                                                                                                                                                                                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — Build a network            | Browser agent formally inspected an empty saved project, proposed six boundary anchors and three interior receivers, displayed the SVG review, and left persistence unchanged before approval. Approval saved nine actual entities. Reviewed undo restored zero objects; redo restored nine.                  |
| B — Diagnose accuracy          | Actual Next tools retrieved completed runs, actual measurement/metric samples, parameter metadata and existing t=0 geometry diagnostics. Tests verify usable anchors and measured noiseless errors below `1e-4 m`. Diagnosis prose from a live model remains deferred.                                        |
| C — Compare estimators         | Browser approved an actual LS/WLS/Huber experiment, observed terminal `completed`, recorded 18/18 estimator samples, and downloaded real JSON. API checks verify within-run shared-frame evidence and cross-run unmatched-observation warnings.                                                               |
| D — Explain/change a parameter | `inspect_parameters(timingNs)` returned the actual default 1 ns and schema guidance. A reviewed change saved 2 ns; separate actual baseline/noisy experiments were retrieved and compared, producing six estimator metric rows.                                                                               |
| E — Add an obstacle            | A reviewed validated rectangle was added, followed by an actual laboratory run. Its returned observation samples contained `blocked: true`. The implementation describes geometric blockage and approximate configured NLOS effects, without claiming full-wave propagation.                                  |
| F — Investigate failure        | An explicitly opted-in isolated worker injected one exception for a private test scenario. The existing queued worker caught/persisted the failure. Actual job retrieval returned `failed`, the injected error, zero completed samples and no successful metrics; a different project could not read the run. |
| Cancellation and export        | A longer actual experiment was submitted, separately reviewed for cancellation, and polled until the real worker returned `cancelled`. The browser exported the completed run through the real download route.                                                                                                |

One captured browser run, `624e959c-56de-4322-a451-0252b0d813d0`, recorded LS RMSE `0.13902556360613175 m`, WLS `0.140311065087379 m`, and Huber `0.13872180506600246 m`, each with 6/6 successful fixes. These are test-scenario synthetic observations computed by TerraLab, not hardware measurements or a claim of general estimator superiority. Test IDs/results are ephemeral and may differ on a later execution.

The browser covers the natural-language orchestration for A/C. B/D/E/F additionally exercise the same real typed tools and approval routes directly, enabling deterministic numerical/failure/cancellation assertions. They do not establish a live provider's ability to plan these workflows. Desktop placement review, completed-results and 390 px mobile screenshots were visually inspected; viewport overflow assertions passed.

## Verification

The clean Phase 1 baseline was checked before Phase 2 implementation: 226 unit tests passed with two existing opt-in skips, typecheck passed, and its actual-route AI fixture flow passed. No baseline blocker was found.

| Exact command                                          | Final result                                                                                                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                    | Passed                                                                                                                                                                    |
| `npm test`                                             | 249 passed, 2 skipped; 23 passing files, 25 total                                                                                                                         |
| `npm run build`                                        | Passed optimized production compilation, TypeScript and route generation; existing routes retained and five new AI routes included                                        |
| `npm run test:python`                                  | 212 passed, 1 existing Starlette/httpx deprecation warning                                                                                                                |
| `npm run test:e2e`                                     | 52 passed, including existing simulator, saved experiments, collaboration entry points, 2D/3D, mobility, themes and responsive UI                                         |
| `npx playwright test --config playwright.ai.config.ts` | 3 passed: browser A/C, actual-tool B/D/E/F, and preserved Phase 1 transport/stop/failure flow                                                                             |
| `npm run test:database`                                | 60 actual local PostgreSQL/RLS checks passed, with fixture Auth/Storage tables                                                                                            |
| `npm run test:collaboration`                           | 19 actual local PostgreSQL security/lifecycle groups passed                                                                                                               |
| `npm run test:worker`                                  | Passed idle wake, abandoned lease recovery and real FastAPI → database queue → numerical worker → immutable artifact publication; 18 noiseless epochs and stranger denial |
| `npm run test:combined`                                | Passed the same durable flow through the combined supervisor with modern service-key isolation                                                                            |
| `git diff --check`                                     | Passed                                                                                                                                                                    |

The two unit skips are the pre-existing opt-in integration/provider checks. Live DeepSeek/Ollama calls are not claimed. DeepSeek and Ollama tool/JSON wire formats are covered by deterministic adapter tests; the explicit local Ollama-format fixture also round-trips through actual Next routes. New security tests cover schema/whole-batch validation, physical/entity bounds, malformed/forbidden calls, approval tampering/replay/stale state, role downgrade/revocation, cancellation before future tools, bounded steps/calls, quota handling, secret/prose exclusion and safe audits. Existing provider tests cover outage, timeout and request bounds.

There are no known failing checks. Existing warnings remain Node `NO_COLOR`/`FORCE_COLOR`, browser `THREE.Clock` deprecation and Starlette TestClient/httpx deprecation. During development a supposedly noiseless template test initially included existing obstacles, which correctly produced real NLOS bias; the baseline test was corrected to remove those obstacles before asserting noiseless error. No production solver was changed to accommodate a test.

## Authority, limits and trade-offs

- No model shell, Python/JavaScript execution, SQL, arbitrary HTTP, filesystem or browser capability. The only scientific addition is bounded project-scoped `GET /experiments?project_id=<uuid>` metadata history. Existing solver, submission/detail/cancel APIs and queue remain authoritative.
- Each allowlisted operation validates arguments, refreshes user/project permission and returns structured success/failure. Cloud reads/writes use the caller's JWT/RLS, never a worker/service credential. Viewer tools omit write preparation and the server independently rejects viewer mutation. Approval rechecks changed permissions and the existing RPC performs final authority/version checks.
- Six model steps, twelve tool calls, 45-second cancellation budget, 60-second route cap, 32,000 text-output characters and 22,000 characters per model-visible tool result. Oversized output asks for a narrower query instead of inventing missing details.
- Existing 500-object project and 100-object laboratory bounds apply. AI runs additionally cap 20,000 estimator epochs and 100,000 anchor observations. Every run is reviewed; large workloads are highlighted. Existing persistent queue limits remain enforced, with an additional project-active-run check.
- Approval receipts expire after ten minutes. Per-process replay tracking and request limiting are bounded; cloud revisions/idempotency are the final cross-instance enforcement. Distributed AI admission control is not introduced.
- Server audits contain actor/project references, trusted tool/state metadata and timestamps, excluding prompts, raw arguments, credentials and arbitrary result prose. Hosting log retention is an operator responsibility; cloud writes retain existing durable domain activity/revisions/jobs.
- Stop halts future agent calls and aborts scoped reads. Already submitted scientific work requires its separate reviewed cancellation control. Cancellation can retain partial results and cannot reverse completed work.
- Local development is explicit loopback single-user mode. The browser rechecks the persisted snapshot before a save and retains recovery copies, but localStorage is not an atomic cross-tab collaborative database. Use one operator/tab; cloud projects keep their existing versioned transaction boundary. Losing an expiring receipt does not erase recovery copies or cloud revisions.
- History/result reads are bounded. Local history inspects at most 50 stored files within a cumulative 25 MB budget plus live jobs; it is not a complete archival index. Summaries expose bounded metric/residual/measurement samples; actual exports remain available. Missing logs are reported as unavailable.
- Project names/descriptions and unrelated collaboration identities are excluded from model context. Result/import text remains untrusted data. The adapter does not claim prompt-injection immunity or prove generated scientific prose correct; authority stays in server validation and explicit review.

## Provider findings and setup

Installed OpenCode desktop is v2.1.2 and its bundled standalone catalogue lists `opencode/deepseek-v4.1-flash-free`. Direct no-key external requests to both OpenCode inference and legacy Zen Chat Completions endpoints returned HTTP 403 `FreeTierError`, restricting the free tier to OpenCode itself. The model was not exposed as a working free TerraLab provider, and no credentials were copied or application identity impersonated.

DeepSeek Harness is free MIT software, separately from inference. The verified developer-preview package is `@deepseek-ai/dsh@0.2.1-rc.2`, with source Node requirement `^22.19.0 || >=24.0.0`. Setup instructions use `npx --yes @deepseek-ai/dsh@0.2.1-rc.2 web`, a disposable workspace and a supported configured provider. Harness was not installed or launched. Hosted DeepSeek can bill the user's account; Ollama remains optional, manually installed and compatibility checked. No paid fallback or new paid service was added.

The complete sourced steps are in [FREE_MODEL_AND_HARNESS_SETUP.md](FREE_MODEL_AND_HARNESS_SETUP.md), with TerraLab environment/key details in [PROVIDER_SETUP.md](PROVIDER_SETUP.md).

## Exact Phase 2 files

Existing files changed:

```text
README.md
apps/web/app/ai.css
apps/web/app/api/ai/chat/route.ts
apps/web/app/api/ai/context/route.ts
apps/web/components/ai-studio.tsx
apps/web/lib/ai/context.ts
apps/web/lib/ai/providers.ts
apps/web/lib/research.ts
docs/ai/PROVIDER_SETUP.md
docs/ai/SECURITY_AND_LIMITS.md
playwright.ai.config.ts
playwright.config.ts
scripts/ai-provider-fixture.mjs
services/api/terralab/experiments.py
services/api/terralab/main.py
tests/ai-e2e/flow.spec.ts
tests/e2e/ai-studio.spec.ts
```

New files:

```text
apps/web/app/api/ai/agent/route.ts
apps/web/app/api/ai/approve/route.ts
apps/web/app/api/ai/compatibility/route.ts
apps/web/app/api/ai/export/route.ts
apps/web/app/api/ai/tools/route.ts
apps/web/components/ai-action-review.tsx
apps/web/lib/ai/agent-contracts.ts
apps/web/lib/ai/agent-permissions.test.ts
apps/web/lib/ai/agent-provider.ts
apps/web/lib/ai/agent.test.ts
apps/web/lib/ai/agent.ts
apps/web/lib/ai/approvals.ts
apps/web/lib/ai/domain.ts
apps/web/lib/ai/parameters.ts
apps/web/lib/ai/scientific.ts
apps/web/lib/ai/tools.ts
docs/ai/AGENT_WORKFLOWS.md
docs/ai/FREE_MODEL_AND_HARNESS_SETUP.md
docs/ai/PARAMETER_REFERENCE.md
docs/ai/PHASE_2_REPORT.md
docs/ai/TOOLS_AND_PERMISSIONS.md
scripts/ai-scientific-fixture.py
services/api/tests/test_ai_history.py
tests/ai-e2e/agent-workflows.spec.ts
```

## Remaining acceptance and future work

Configure an explicitly selected supported provider and run Verify tool compatibility, then manually assess live A–F planning/explanations and scientific uncertainty. Hosted Supabase/browser acceptance should be performed separately in authorized staging; local SQL/RLS and transport fixtures do not establish hosted acceptance. No provider key needs to be sent through chat.

Phase 3 remains future work: any test-running/coding agent needs separate isolated execution, bounded resources and provenance design. It was not started. There is no persistent chat history, distributed AI rate service or new production monitoring infrastructure in this phase. Rollback is reverting the additive local application change; no database migration or research-data rollback is required. Recovery copies and generated test artifacts are ordinary existing local data and remain outside version control.
