# TerraLab AI test plan

Updated 22 October 2026. Ordinary suites are deterministic and require no paid inference. Live local model acceptance is separate and explicitly opted in. Results and known limitations are recorded in [PHASE_3_REPORT.md](PHASE_3_REPORT.md).

## Workbench follow-up acceptance

See [WORKBENCH_FOLLOWUP.md](WORKBENCH_FOLLOWUP.md): 277 unit tests, 14 distinct AI/Manuscript browser cases, 52 simulator cases, eight authenticated browser cases, 23 research security groups, typecheck/build, actual free Qwen explanation and a hosted rolled-back database save/read/revision/audit check. The new source of deployment identity is /api/version.

## Current enhancement acceptance (22 October 2026)

These results supersede earlier phase counts below. No lint runner is configured. The same .next-tests directory is used sequentially; ordinary .next and the free profile's .next-local-ai are left separate.

| Command | Final result | What actually ran |
| --- | --- | --- |
| npm test | 274 passed, 2 opt-in skips | Actual unit code; provider/Auth/upload transport fixtures where declared |
| npm run typecheck | Passed | TypeScript, no emit |
| npm run test:python | 222 passed | Existing numerical/backend tests; unchanged tolerances |
| npm run test:database | 60 checks passed | Actual disposable PostgreSQL/PGlite RLS, fixture Auth/Storage tables |
| npm run test:collaboration | 19 groups passed | Actual disposable PostgreSQL policies/RPCs |
| npm run test:research | 23 groups passed | Research permissions, conflicts, history, evidence, UTF-8 extraction, search, quotas, audit and private-file policies |
| npm run test:worker | Passed | Real numerical worker with local protocol/storage fixtures |
| npm run test:combined | Passed | API -> PostgreSQL/queue -> real combined worker -> immutable output -> exact 18 noiseless epochs; outsider denied |
| npx playwright test --config playwright.ai.config.ts | 12 passed | Real browser/Next/IndexedDB, numerical API and approved restricted test process; explicit Ollama protocol fixture for generated prose |
| npx playwright test | 52 passed | Existing simulator, 2D/3D, exports, responsive and scientific workflows |
| npm run test:e2e:auth | 8 passed | Separate account browser contexts with real PostgreSQL RLS and simulated Supabase Auth/PostgREST |
| npx playwright test --config playwright.ai.config.ts selected-canvas.spec.ts workbench.spec.ts research-workspace.spec.ts | 7 passed after final fit/theme corrections | Actual canvas, selected sources, PDF extraction, revisions, numerical evidence and reviewed insertion |
| $env:TERRALAB_BROWSER_TEST='1'; npm run build | Passed | Production webpack build, full TypeScript check and static/dynamic route generation; only output/tsconfig isolation changes |
| npm audit | 0 vulnerabilities | Pinned dependency audit at verification time |

The final full AI run includes a real restricted ai-unit command (58 passed, one opt-in skip). Tests respect the shared local actor's real request limit: a rate-rejected action is not treated as submitted, and a fresh human-reviewed proposal is required after an authorized read succeeds. No security limit, numerical tolerance or assertion was disabled.

Actual laptop acceptance is separate: Chromium -> Next 13040 -> Ollama 11435 with downloaded Qwen Instruct passed generation and formal tool/structured-JSON verification. A separate actual-runtime browser smoke verified two-source context, text search, exact downloads, deletion, failed PDF extraction retention and light/dark/mobile screenshots. No paid provider was called. [Local model report](LOCAL_MODEL_CONNECTIVITY.md) and [Research report](../research/RESEARCH_WORKSPACE_REPORT.md) record commands, bounds and limitations.

Not verified: hosted research migration/Storage lifecycle, real hosted multiuser accounts, paid DeepSeek inference, native PDF-frame pixels across browsers, full TeX compilation and deployed-HTTPS-to-laptop inference. The hosted /studio and /ai were checked in isolated Chromium and returned 200; these checks do not prove that the unpushed enhancement is already deployed. No production settings or Render service was changed.

## Existing commands discovered

The root/workspace `package.json`, `vitest.config.mts`, Playwright configurations, Python requirements/tests and repository scripts were inspected. There is no `.github` CI workflow directory or lint script/configured lint runner in this checkout; neither is invented or presented as tested.

| Fixed ID             | Actual invocation                                                                             | Timeout | Test network policy                                 |
| -------------------- | --------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------- |
| `typecheck`          | `node node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json`                     | 180 s   | none                                                |
| `frontend-unit`      | `node node_modules/vitest/vitest.mjs run --maxWorkers=2`                                      | 180 s   | none                                                |
| `ai-unit`            | `node node_modules/vitest/vitest.mjs run apps/web/lib/ai --maxWorkers=2`                      | 180 s   | none                                                |
| `scientific-unit`    | project Python `-m pytest services/api/tests -q --tb=short -p no:cacheprovider`               | 180 s   | declared loopback fixtures only                     |
| `browser-regression` | `node node_modules/@playwright/test/cli.js test --workers=1`                                  | 420 s   | loopback application services                       |
| `ai-workflows`       | `node node_modules/@playwright/test/cli.js test --config playwright.ai.config.ts --workers=1` | 240 s   | loopback scientific service / labeled model fixture |
| `production-build`   | `node node_modules/next/dist/bin/next build apps/web --webpack`                               | 300 s   | none                                                |
| `database`           | `node scripts/test-database.mjs`                                                              | 120 s   | none; local PGlite                                  |
| `collaboration`      | `node scripts/test-collaboration.mjs`                                                         | 120 s   | none; local PGlite                                  |
| `worker-integration` | `node scripts/test-cloud-worker.mjs`                                                          | 240 s   | declared local HTTP fixtures                        |
| `combined-worker`    | `node scripts/test-cloud-worker.mjs --combined`                                               | 240 s   | declared local HTTP fixtures                        |

These commands are hardcoded inside the restricted runner, not read from a model-supplied string or executed through npm/shell command interpolation. Package scripts were used to discover the intended checks, while executable/argv are fixed. There is no package installation, arbitrary file selector, shell pipeline or source-edit command. Running potentially hostile code requires a real independently provisioned sandbox; the installed fallback executes only reviewed trusted development snapshots.

## Actual runner controls and reporting

Review shows command ID/argv, source commit and SHA-256 working-tree fingerprint, timeout, network policy and limits. A changed source snapshot is rejected at execution. Files are copied into an ignored disposable UUID directory; environment files, Git metadata, data/cache folders and filesystem symlinks outside the approved source are excluded. Installed third-party dependencies are shared; the local workspace packages point to the disposable source. The generated Next type references contain no deployment configuration.

The command receives a fresh environment without Supabase/provider/deployment keys and cannot inherit arbitrary Node options. Python/Node network guards enforce the stated policy for normal trusted test code; they are not an OS network sandbox. Windows Job Objects set 30% CPU, 48 processes, committed memory 3 GiB/process and 6 GiB/job; node heap is 2 GiB. A failure to apply limits stops the command. One test job can be active at a time. Timeout, cancellation and output exhaustion stop its process tree. Logs are drained with a 64 KB cap and redacted; only a 12 KB excerpt enters model/UI tool results. Up to 30 local jobs are retained.

Every result has a stable ID, exact command, source hash/commit, actual timestamps/exit status, real-execution flag, state, bounded output, and counts only when a runner summary supplies them. Missing counts remain null, including not-run totals when unavailable. A zero exit code means completed, while missing exit code, timeout, interruption, cancellation, output overflow or nonzero exit never means a pass. Polling is read-only and never submits work again. A test fix needs separate operator approval/application and a new source snapshot/run.

## Deterministic verification

```powershell
npm run typecheck
npm test
npm run test:python
npx playwright test --config playwright.ai.config.ts
npm run test:e2e
npm run test:database
npm run test:collaboration
npm run test:worker
npm run test:combined
npm run build
git diff --check
```

The Phase 3 unit tests reject command injection and cloud-backed aliases, enforce production-disabled testing, verify bounded actual sweeps and task-history actor/project/expiry boundaries. Python tests run real tiny child processes through the resource-limited worker to verify exit 0, exit 7, timeout, cancellation and output overflow. These explicit fixtures are injected only by the unit harness and are absent from the approved command catalogue. A liveness test proves polling does not signal or terminate a child. Local scientific idempotency is checked across in-memory cache eviction and persisted snapshots.

The focused browser suite runs actual Next routes and Python computations with a clearly labeled deterministic model fixture. Its Phase 3 case constructs a reviewed real network, executes the actual `ai-unit` command in a disposable snapshot, verifies the real exit/counts, reloads the browser and reopens the same result, runs one actual controlled parameter sweep, retrieves completed results, collects accuracy evidence and rejects a shell-injection command ID. It also checks mobile overflow. Original Phase 1/2 transport, editing, undo/redo, paired/unmatched comparison, actual worker failure and cancellation remain covered. Numerical results are never mocked into successful final answers.

## Opt-in live local inference

After installing and starting the free local model server on 11435:

```powershell
$env:TERRALAB_AI_LIVE_TEST = '1'
$env:TERRALAB_AI_LIVE_MODEL = 'qwen3:4b-instruct-2507-q4_K_M'
$env:TERRALAB_AI_LIVE_OLLAMA_URL = 'http://127.0.0.1:11435'
npx playwright test --config playwright.ai-live.config.ts
```

This separate configuration owns isolated Next/scientific services on 13043/18043, uses actual local Ollama, disables hosted inference and never downloads models or reads an API key. It checks a real browser conversational final answer, formal native tool calling plus structured JSON compatibility, authorized actual project inspection, and a model-generated experiment proposal that requires review before submitting to the real scientific worker. It fails rather than treating advertised capabilities, incomplete reasoning, mocked content or a submitted operation as proven success. Run development browser suites and production builds sequentially because they share the Next build directory. The laptop should not hold a loaded 8B model and all large test/build processes concurrently; unload the model while deterministic regressions run, then check live inference separately.

Hosted user-owned key saving, invalid-key/quota/timeout behavior and redaction have deterministic tests. Live hosted provider acceptance and hosted Supabase/RLS/browser deployment remain **NOT VERIFIED** without an explicitly authorized staging environment and user-owned provider configuration. The installed free-only profile intentionally rejects hosted calls.
