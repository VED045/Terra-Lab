# Phase 4B validation and reproduction

Use deterministic local fixtures and the existing isolated web/API harness. Chromium is started with --enable-unsafe-swiftshader so headless WebGL is exercised; this is software rendering, not a hardware GPU benchmark.

## Automated coverage

| Contract | Coverage |
|---|---|
| 2D default / no data changes | Existing 2D regressions plus mode/view-state serialization assertions |
| Coordinate / scale conversions | Metre/cm/km ENU roundtrips; invalid scales rejected |
| Missing Z / v1 import | Existing imports stay unchanged; anchors/paths gain no Z |
| Editing | Shared inspector, snapping, path translation, creation, deletion, duplicate, undo/redo; receiver altitude-only Z |
| Scientific overlays | Exact saved truth/estimate/value/residual; null fixes and gaps; changed geometry hides snapshot |
| Roles and conflicts | Owner/editor/viewer Auth/PostgREST browser fixtures; server-denied 2D viewer save; read-only 3D controls/store; stale save preserves edited coordinates/version |
| Navigation / display | Camera presets, perspective/orthographic, units/layers, theme and mobile controls |
| Errors and cleanup | WebGL-unavailable and context-loss recovery to unchanged 2D; repeated mount/unmount |
| Scale | 500-object scene with instancing and bounded labels; observe draw calls and startup duration |
| Branding | Canonical SVG and ICO/Apple routes; app mark, PDF footer and README identity |

Commands: npm test; npm run test:python; npm run test:database; npm run test:worker; npm run test:combined; npm run test:e2e; npm run test:e2e:auth; npm run typecheck; npm run build.

The default JavaScript suite intentionally excludes the existing opt-in real Next→Python integration; run it with RUN_SCIENCE_INTEGRATION=1 and SIMULATION_API_URL pointing at the harness API. Do not substitute a production URL or real credential for local fixtures.

## Performance target and scope

For the 500-object fixture (499 anchors and one receiver), target less than 10 seconds from local studio navigation to a ready WebGL scene on this development host, after dependencies are installed, and no per-anchor draw calls. Record actual timing, draw calls and environment in COMPLETION_REPORT.md. Demand rendering must settle when paused; labels cap at 80 objects and the tree remains complete. Recorded paths cap at 2,000 samples, links at 1,000 and the text table at 100 rows, with full values retained in exported output.

Exercise repeated switches and assert that the WebGL canvas is removed on each return to SVG. Treat React unmount warnings and page errors as issues; do not hide them with console filters. The known upstream Three.Clock deprecation from Fiber is recorded separately.

Hardware GPU timing, long soak/resource profiling, maximum-path/maximum-polygon combinations, all mobile browsers and real hosted multi-user acceptance are separate checks. Local Auth/Storage fixtures are not evidence of hosted provider acceptance.

## Execution record

See COMPLETION_REPORT.md for final executed checks and limitations. A planned case is not a passing result.
