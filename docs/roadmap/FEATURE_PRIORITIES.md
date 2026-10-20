# Phase 5 feature priorities

Status: proposed for approval, 2026-10-20. No feature implementation or push is authorized by this plan alone. Baseline: `8dc4fdc`.

| Order | Subphase | User value | Risk | Dependency / scope |
|---|---|---|---|---|
| 1 | 5A — Requested usability fixes | Immediate: coherent dashboard palettes; understandable actions/parameters; easy rename; duration controls beyond one minute | Low to medium: naming touches versioned persistence | Existing controls/save paths; no shared-schema, database or solver changes |
| 2 | 5B — Physical obstacle dimensions | Correct per-building/wall/obstacle Z geometry | Medium to high: schema and older-client round trips | Approve additive compatibility contract first; preserve XY footprints and historical requests |
| 3 | 5C1 — Workspace and sharing completion | Better overview, filters, explicit action confirmations and permission preview | Medium: bounded indexing and effective access | Reuse existing categories/RPCs; test direct/team precedence and invitation scope |
| 4 | 5C2 — Conflict recovery | Compare stale draft with latest revision and safely copy/reapply changes | Medium to high: accidental data loss | 5C1; ID-based object reconciliation; recheck expected version and permissions at save |
| 5 | 5C3 — Recorded activity | Understand who changed shared research | High: authoritative audit writes/RLS/migration | Agree event/privacy/retention contract; transactional server writes; cannot claim complete history before rollout |
| 6 | 5D1 — Immutable run comparison | Compatible side-by-side metrics and configuration warnings | Medium: scientific interpretation and partial runs | Existing frozen runs; full-precision metrics; model/units/cohort compatibility |
| 7 | 5D2 — Comparison charts and exports | Residual/CDF/trajectory analysis and reproducible comparison artifact | Medium: large raw data and downsampling | 5D1; bounded charts, full-data metrics, explicit missing data and failure gaps |
| 8 | 5E — Research report collections | Named report sets and methodology/results/limitations templates | Medium to high if cloud collections added | 5D exports; lineage/hashes; separate reviewed migration for collections if needed |
| 9 | 5F — Controlled validation studies | Evidence for scientific strengths and failure modes | High scientific risk | Predefine study matrix, seeds, tolerances and fixtures before experiments; publish negative results |
| 10 | 5G — Further optional 3D maturity | Saved independent view presets and repeatable visual checks | Medium: WebGL/platform differences | Stable 5B, deterministic scenes; 2D import/startup stays independent |
| Gated | 5H1 — Hosted acceptance and reliability baseline | Establish actual readiness, cold-start recovery and access enforcement | High if production data used | Explicit staging destination/accounts/mutation scope; no production-reset or implicit provider change |
| After H1 | 5H2 — Operations and cleanup | Readiness/queue visibility, controlled retention and disaster recovery | High for deletion/backup restore | Hosted acceptance, inventory and dry-run retention, load evidence; no automatic job-limit increase |
| Separate research approval | True XYZ positioning / full MBWDE | Potential future scientific capability | Very high | New state/model contracts, references/data requirements and independent numerical validation; excluded from routine 5B extrusion |

5H1 can be scheduled independently when a staging scope is approved; its gate precedes operational expansion, not documentation or isolated local UX work. Existing deployability must not be represented as production acceptance.

## Why 5A comes first

The user's latest concrete problems are mostly existing functionality that is hidden or inconsistently presented. Eight palettes omit the dashboard selector; name editing already exists inside Details; laboratory descriptions already exist; baseline/lab limits already exceed a minute. Fixing these surfaces provides useful results without expanding compute limits or changing scientific data. This is smaller and easier to accept than combining new geometry contracts, collaboration migrations and comparison/report infrastructure.

5B is deliberately separate: an object's XY footprint `height` cannot safely become Z height. Display dimensions should be named unambiguously and preserved across imports, revision restores, worker snapshots and exports before new geometry is shipped.

## Definition of done for each approved subphase

- Explain the concrete behavior changed, supported bounds and scientific limits.
- Add feature/regression coverage required by the supplied brief; run relevant local checks and a production build when application code changes.
- Preserve existing 2D semantics, immutable results and server/database access enforcement.
- Document implemented, tested locally, hosted-verified and proposed status separately.
- Review migrations and compatibility before any database mutation; never reset production data.
- Do not push or publicly deploy without explicit authorization for the approved delivery.

Detailed acceptance criteria and test plans are in [the implementation plan](PHASE_5_IMPLEMENTATION_PLAN.md).

## Subsequent authorization

The user subsequently approved proceeding with the roadmap and explicitly authorized pushing after verification. The approval gate in this initial planning document has been satisfied. See PHASE_5_IMPLEMENTATION_STATUS.md for implemented, locally tested and still-gated hosted work.
