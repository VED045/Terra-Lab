# Phase 5 implementation and acceptance plan

Planning only; implementation awaits explicit approval under the supplied Phase 5 brief. Date: 2026-10-20. Source baseline: `8dc4fdc`. Each numbered subphase is independently reviewable; approving one does not authorize the entire roadmap, hosted migrations, destructive cleanup or a public deployment.

## 5A — Requested usability fixes (recommended next)

Changes:

1. Include the Research page in all ten existing theme surfaces. Retain canonical theme selection and current navigation behavior.
2. Reuse Radix for top-positioned tooltips on Run baseline, Run demo, Laboratory/Lab, Load benchmark and Run reproducible experiment. Explain scope, destructive benchmark replacement, and disabled conditions. Essential text must also be available to keyboard/touch users.
3. Give laboratory controls concise parameter meaning, units, effect and model applicability, building on the existing descriptor catalog. Explain duration vs sample interval, trials vs sweep cost, clock bias/drift, dropout/availability, NLOS, noise, robust tuning and filter assumptions. Lower noise is not a guarantee of better geometry; robust methods do not always win.
4. Add a discoverable Rename action in the studio and dashboard with an accessible dialog. Validate trimmed 1–80-character names, preserve project identity and live unsaved geometry, use the existing expected-version save, and show actionable conflict errors. Define local rename versus publishing clearly. Viewers cannot publish changes.
5. Make baseline duration (currently up to 3,600 seconds) and laboratory trajectory duration (currently up to 300 seconds) easy to find, with 120-second presets or direct inputs. Show the planned workload before laboratory submission using existing validation rules. Do not increase epoch/observation/queue limits or promise hosted long-run completion without evidence.

Acceptance and tests:

- Parameterized browser check for every palette on `/projects`, plus studio/dialog/tooltip consistency, navigation and narrow-screen layout. Assert theme tokens as well as inspect representative light/dark/color screenshots.
- Tooltips show on hover and keyboard focus, prefer above the button where space permits, explain each specific action, close on Escape, do not execute actions on focus, and retain usable disabled-state help. Test small screens without requiring hover.
- Numeric inputs and sliders retain identical bounds, defaults, units and effects on configuration. Required help is associated with controls using accessible descriptions. Benchmarks retain the same scientific configuration.
- Rename: accept valid names; reject whitespace/overlong values; cancel leaves state unchanged; local/cloud save/reload; owner/editor/viewer cases; stale expected revision; edits made during save and undo history remain intact. Historical runs retain their original project names/configurations.
- Baseline duration 120 seconds survives save/import and timeline scrubbing above 60 seconds; deterministic playback progression crosses 60 without a slow wall-clock test. Laboratory controlled moving fixture uses duration 120, sample interval 10, trials 1, one estimator and no sweep: 13 epochs per receiver. Verify t=0 and t=120, failed-fix accounting and immutable saved request. Existing upper bounds and work-budget rejection still hold in JS/Python.
- Run focused unit/browser/auth regressions, typecheck and production build. Record hosted status separately; no full-suite pass claimed unless actually executed.

Dependencies/risk: existing project save/RLS and descriptions; no shared-schema or DB migration. Main risk is losing unsaved state during rename or misrepresenting existing duration limits.

## 5B — Physical building, wall and obstacle dimensions

Proposed compatibility contract for approval before code:

- Domain axes remain X east, Y north, Z up, in metres. User labels become Width (X), Depth (Y), Height (Z), plus optional Base elevation (Z). In the existing wire schema `width` stays X and **`height` stays Y depth**; no semantic rename in old data.
- Add separately named optional finite `verticalHeight` and `baseElevation` properties for obstacles only. Proposed bounds: vertical height greater than zero and at most 10,000 m; base elevation between -1,000,000 and 1,000,000 m. Missing fields remain absent/unknown. A user-entered height with unknown base can render relative to a clearly labelled presentation ground; it must not imply a surveyed base elevation. New-object defaults must be visibly identified as assumed dimensions.
- Rectangle/wall footprints retain width/depth; polygon footprint vertices remain authoritative XY. Extrude each object using its own entered vertical dimension, account for its base/top in camera fitting and selection, and label unresolved dimensions. Retain a distinct illustrative fallback for legacy objects rather than persisting an invented physical height.
- Do not change XY scientific obstruction, distance, estimator or covariance calculations. The UI/docs must state that new dimensions describe geometry while the approved physics remains horizontal. Vertical ray tests or true XYZ positioning require separate scientific approval/versioning.
- Before selecting a wire version, audit every import, serialize/clone, project/revision save, worker snapshot/hash, report and result parser. Current schema-v1 Zod readers strip unknown object keys, so simply adding fields under v1 would allow old clients to discard dimensions silently. Recommended approach: explicitly version the new project contract, provide a lossless v1-to-new importer with absent Z, and make older-client handling/rejection a documented compatibility requirement. Ship no mixed-client rollout without verifying old-client/server behavior.
- Database RPC currently admits only schemaVersion 1. A new contract therefore needs a reviewed additive migration, stricter nested validation and rollout sequencing; do not silently change the version predicate in application code alone. Preserve stored v1 revisions/runs byte-for-byte; convert only editable copies on load. Browser and Python validation must agree on new bounds and optional semantics.

Acceptance and tests:

- Fixtures for old v1 rectangle/wall/polygon imports show identical XY footprint, obstruction flags and scientific values; no Z is invented. Invalid/nonfinite/negative dimensions fail at browser/API/DB boundaries as applicable.
- Enter distinct heights and elevations on multiple objects; verify world-space geometry, labels, camera bounds, independent editing, selection, duplicate, undo/redo, serialize/reload, revision restore and report/manifest provenance.
- Compatibility matrix covers old/new project files, old immutable result requests, new snapshots, older-client save attempts, worker processing, stale saves and viewer denial. No unknown-field truncation is accepted as lossless compatibility.
- Use deterministic 3D fixtures with dimension/readout assertions and representative screenshots. Recheck 2D startup without WebGL and existing 500-object performance bounds; do not infer a hardware guarantee from software rendering.
- Run shared/Python/schema/RPC tests, normal/auth 2D/3D regression, typecheck/build and controlled numerical equality checks. Review forward fix/rollback behavior before any hosted schema change; no production data rewrite.

Dependencies/risk: shared schema and server/database support, old-client handling, export compatibility and geometry bounds. Implementation may be split into contract/migration tests, then editor/renderer, then acceptance. None is authorized by this proposal alone.

## 5C1 — Workspace and sharing completion

Reuse current categories; add supported owner/team/update/status filters, project overview and last-editor information from actual revision authors. Clarify the 200-row loaded-index limit or add bounded server pagination. Add explicit confirmation to duplicate/archive/restore/save-copy workflows. Improve permission preview and invitation state handling, retaining reusable-link scope and effective direct/team precedence.

Acceptance/tests: truthful empty/loading/error states; cross-page filtering; owner/editor/viewer capability matrix; direct plus team grants and final revocation; expired/revoked/recreated invitations; copy gets a fresh project ID; cancel makes no mutation; restoring creates a new revision and preserves historical runs. Execute RPC/RLS and authenticated browser fixtures; record hosted tests only when run with approved isolated accounts. No new real-time claim.

Dependencies/risk: available metadata, effective access, pagination and data minimization. Any new RPC must enforce authorization independently of UI filtering.

## 5C2 — Conflict comparison and recovery

On stale save, retain local draft and fetch the latest authorized version into a separate comparison. Show local/latest/base where a base is available; identify additions/removals and scientific settings. Support export/copy and deliberate selective reapply, using stable object IDs. Do not guess a three-way merge without a saved base.

Acceptance/tests: two isolated editors change same and different objects; delete-vs-edit, object reordering, stale metadata rename, repeated conflict, permission revocation and fetch failure. Latest changes are never silently overwritten; unresolved changes remain visible; save uses the refreshed expected version and can conflict again. Copy is a new ID. Unit diff/reapply and SQL/auth browser regression required.

Dependencies/risk: immutable revision retrieval and ID-aware reconciliation. No synchronized editing, presence or automatic remote overwrite.

## 5C3 — Recorded collaboration activity

Propose versioned append-only event storage with event type, actor ID, server timestamp, authorized project/resource and revision/run/artifact reference. Write authoritative events transactionally with their actions; avoid raw configs, tokens, invitation URLs and unnecessary personal details. Label the feed as recorded history and state when recording began.

Acceptance/tests: forbidden client inserts/updates/deletes, outsider read denial, direct/team access and revocation, actor spoof rejection, transaction rollback, exactly-once publication events under retry and absence of sensitive payloads. Define event types not covered transactionally before claiming completeness. Migration/retention review and SQL tests precede UI.

Dependencies/risk: new DB migration, privileged writer boundaries, identity deletion policy and historical gaps. Report generation events distinguish generated vs uploaded/imported artifacts.

## 5D1 / 5D2 — Cross-run comparison, then charts and export

5D1 selects multiple frozen runs, groups by compatible measurement/units/estimator/cohort, shows full-precision RMSE, median/P95/max error, availability, failed fixes/reasons and runtime, and exposes configuration differences. Display dataset/seed/configuration/software differences; exclude metadata-only differences from controlled-variable counts while retaining them in the full diff. Matching seeds alone do not establish identical datasets or paired observations.

5D2 adds residual distributions, empirical CDFs and selected trajectories with failure gaps, plus comparison JSON/CSV/report manifest referencing source run IDs and hashes. Define pooling, epoch matching and residual units explicitly; do not mix angular, timing and range residuals into one distribution. Never recompute metrics from chart samples.

Acceptance/tests: identical configs, one-variable versus multiple-variable changes, different seeds/observation hashes, incompatible models/units, differing anchor sets, partial/cancelled/failed runs, zero successful fixes and large datasets. Independent fixtures verify metric denominators/quantiles and availability; all-failed rows stay unavailable, never zero error. Verify exported full precision, source references, chart gap behavior and render-time bounds. No historical record mutation.

Dependencies/risk: raw result availability, bounded downloads, statistical interpretation. Separate metric compatibility from controlled experimental comparability.

## 5E — Collections, templates and report provenance

Add named collections referencing immutable run IDs/artifacts and editable report narratives; provide methodology/results/limitations templates. Distinguish imported configurations, modified copies and original runs. Keep raw result hashes and derived artifact hashes separate, with units/captions and explicit sampling notes.

Acceptance/tests: owner/editor/viewer and revocation, renamed/deleted collection behavior without deleting source runs, import/export round trip, missing/altered source rejection, PDF/chart visual QA, full JSON/CSV precision and honest hash/signature wording. If cloud collections need tables/RPCs, review a separate versioned migration and local SQL tests first.

## 5F — Controlled scientific validation

Predefine geometry, timing/calibration, clock bias/drift, contamination/NLOS, missingness, robustness, motion/filter consistency and model-misspecification studies. Fix seeds and tolerances before running; use matched observations where comparisons require pairing. Include non-favorable seeds and failed fixes. Synthetic and hardware evidence remain separate.

Acceptance/tests: independent noiseless analytic fixtures, published parameter/seed matrix, accuracy and availability with denominators, residual checks and covariance/coverage diagnostics under declared assumptions; re-execution produces supported-environment results within predefined tolerances. Publish negative results. True XYZ studies are only designed once genuine XYZ support is separately approved. Full MBWDE requires its own reference/data/initialization/model-order review and is not a relabeling exercise.

## 5G — Further optional 3D maturity

Persist camera/layer preferences separately from scientific configuration with a view-format version; add deterministic visual fixtures and broader browser/performance checks. No new numerical state or heavyweight dependency on the default 2D path.

Acceptance/tests: view-only changes do not change scientific request/hash; legacy view prefs recover safely; 2D fallback works with unavailable/lost WebGL; repeated switches release resources; fixed-scene visual thresholds tolerate platform differences while numeric geometry checks stay exact. Extend performance beyond the existing anchor-heavy 500-object fixture to mixed paths/polygons; long-soak/mobile acceptance remains separate until executed.

## 5H1 / 5H2 — Hosted acceptance before operational expansion

H1 requires an explicitly approved staging destination, isolated users and bounded create/read/update/delete scope. Verify deployed revisions, migrations/policies, real Auth, invitation/role/revocation, known private objects, queued result publication, lease recovery, cancellation and cold starts. Keep frontend reachability, API liveness, worker readiness and completed-job evidence separate.

H2 follows H1: privacy-safe queue/job metrics and readiness; retention inventory/dry run and conservative cleanup; backup plus separate Storage recovery; realistic load/resource tests. No higher job limits without evidence.

Acceptance/tests: positive and negative known-object requests, isolated concurrent saves/jobs, worker kill/restart and partial upload recovery, bounded retries/failures, sanitized logs, no secrets in client/artifacts, orphan inventory protects referenced immutable bytes, tested backup restore in staging. Cleanup requires an approved retention contract and exact deletion scope; never reset production data. Provider configuration/deployment and production migrations need explicit authorization.

## Approval requested

Approve **5A only** to implement the requested usability changes using existing duration bounds. Review/approve **5B's compatibility contract separately** before adding physical obstacle Z fields. All later subphases remain proposals until selected. Push/public deployment is a separate explicit authorization under the new brief.

## Subsequent authorization

The user subsequently approved proceeding with the roadmap and explicitly authorized pushing after verification. The approval gate in this initial planning document has been satisfied. See PHASE_5_IMPLEMENTATION_STATUS.md for implemented, locally tested and still-gated hosted work.
