# Research-agent workflows

Use AI Studio with **Research agent** checked. Connect a supported provider/model and choose **Verify tool compatibility** to issue real tool-call and structured-JSON probes. Presence of a key or a model-list entry is not proof of tool compatibility. Uncheck Research agent to retain the original streamed explanation-only interface.

The agent initially inspects the selected project and then uses bounded, typed domain tools. A proposed plan is distinct from the tool timeline. Timeline entries are executing/completed/failed/cancelled, with safe argument summaries and actual structured results. A preview is not a change. **Approve & apply** performs the reviewed operation; **Cancel proposal** leaves domain state unchanged. After approval the composer offers a continuation prompt; send it to continue the original task under a fresh step/time budget.

## A — Build a network

For example: “Create six anchors on the boundary x=0..100 m, y=0..80 m and three receivers inside.” The agent reads actual schema bounds/extent and existing IDs. If the boundary is ambiguous, it asks for dimensions rather than inventing them. It prepares one validated batch with existing entity defaults. Review the placement preview, full properties and any deletion consequences, then approve. The UI saves the actual snapshot, provides entity/network links, and offers reviewed undo/redo. Local changes also leave a private before-change copy in Projects; cloud changes retain existing revisions. A significant scenario can instead begin with `propose_scenario_copy`.

## B — Diagnose poor accuracy

Ask for the latest actual run and diagnosis. The agent reads its status, recorded errors/residuals/metrics, current parameter values and baseline geometry diagnostics. It distinguishes completed computation from successful fixes, and measured evidence from hypotheses. Suggestions should change one controlled variable or compare supported estimators under matched observations. A baseline t=0 calibrated-range diagnostic is labeled separately from laboratory-model results.

## C — Compare estimators

Ask for LS/WLS/Huber comparison where compatible with the chosen measurement. The agent proposes one run containing all requested supported estimators, preserving the chosen seed and measurement conditions. Review the workload/configuration and approve submission. The returned real job ID is initially submitted/queued/running, not successful. The UI polls real progress and shows terminal metrics and sample counts. Within-run observation hashes provide stronger pairing evidence than merely matching seeds. Cross-run comparisons show warnings for changed inputs, unpaired hashes, partial results and differing measurement models. Error metrics are conditional on successful fixes.

## D — Explain and change a parameter

Ask for an exact implemented parameter, such as `timingNs` or `receiver.clockDrift`. The agent retrieves units, actual default/range/current value and source references, distinguishing source-grounded facts from mathematical effects and heuristics. It proposes a bounded change for review. After approval, continue the original task to run a controlled experiment and compare actual snapshots. Lower assumed noise is not automatically lower true noise or guaranteed better accuracy.

## E — Add an obstacle

The proposal uses the existing obstacle entity with validated XY position, shape and dimensions. The browser baseline marks/excludes geometric intersections; the laboratory engine implements geometric NLOS plus explicit approximate excess-path and empirical link-budget effects. Neither is a full-wave multipath/ray-tracing solver. Approve the obstacle, then approve a controlled laboratory run. Inspect actual blocked/NLOS observation flags and recorded metrics before describing the effect. Schema-2 physical height is presentation geometry, not an additional XYZ positioning or realistic RF capability.

## F — Investigate a failed run

Inspect the actual failed job, error text available to the user, completed/planned counts and configuration. The agent must not treat a successful HTTP submission as successful computation. Failed/partial results remain failed/partial. If the underlying worker supplies no diagnostic detail, say so; do not fabricate logs. Propose a safe next experiment or validation fix, with review, rather than overwriting the failed record.

## Cancellation, exports and recovery

Stop response stops future agent tool calls. Submitted jobs continue independently until finished or cancelled; use Cancel active run, review the exact run and approve worker cancellation. Poll until the actual terminal state appears. Cancellation cannot undo completed work and may retain partial output.

The Actual experiment result panel exports the real terminal JSON/CSV through the existing conversion. Completed local results are additionally saved through the existing IndexedDB mechanism for laboratory history. Download links are authenticated and constrained to the selected project. Already downloaded data cannot be recalled by later permission revocation.

## Verification evidence

`npx playwright test --config playwright.ai.config.ts` owns isolated local services and data. The browser test exercises A/C, placement review, real browser persistence/recovery, undo/redo, actual numerical completion, metrics and JSON download. The API workflow test exercises B/D/E/F through the real Next routes, validated local snapshots and Python engine, including actual cross-run warnings, paired estimator frames, blocked observations and cancellation. A separate original Phase 1 transport test remains intact in explanation mode.

The model is a clearly labeled deterministic protocol fixture; the scientific computations are real. The failure workflow injects one exception in an explicitly opted-in, isolated test worker and verifies the real queue/error persistence path. It does not mock a successful/failed final answer or alter the production engine. Live AI/model-quality acceptance is deferred at your request until you configure a supported provider. Provider wire-format tests cover both DeepSeek and Ollama; the fixture exercises Ollama tool and structured-output round trips. No paid request or free-tier restriction bypass occurs.
