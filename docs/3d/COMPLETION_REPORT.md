# Phase 4B completion report

## Delivered

- Optional, lazy-loaded Three/Fiber 3D workspace inside the existing application shell. 2D remains the default, supported SVG editor.
- Perspective/orthographic cameras; orbit/pan/zoom; fit/reset/top/front/side views; grid, axes/origin labels, orientation indicator, unit scaling, ground/coordinate planes, dark/light themes and layer controls.
- Shared project, selection and inspector. Supported XY translation gizmo and axis constraints, snapping, creation, duplicate/delete and undo/redo. Receiver altitude uses its existing metadata field only; anchors, paths and footprints have no surveyed Z.
- Actual stored XY truth/estimate trajectories, errors, original observation/residual values and statuses, including unavailable anchors with no invented observation. Failed fixes stay null, and sampled paths retain failure gaps. Only existing XY uncertainty ellipses are shown.
- WebGL-unavailable/context-loss/error/empty states with a return to the preserved 2D project. Instanced repeated objects, batched links/trajectories, bounded labels and disposal. DOM labels stay in the application root; nested-root cleanup warnings were fixed.
- Cloud 3D access fails closed until the role is known. Viewer mutation/save controls and shared-store keyboard mutations are blocked; existing owner/editor versioning and conflict recovery remain authoritative through RPC/RLS.
- One network-tower SVG used for app branding, SVG favicon, generated multi-size ICO/Apple icon, PDF footer and README. Brand derivatives are reproducible with npm run brand:generate.
- Supplied README adapted into an end-user guide with live-app links, real screenshots, workflows and scientific limitations. Deployment, Supabase migration and local-install instructions were removed from README.

## Executed verification

| Check | Result |
|---|---|
| JavaScript/Vitest | 173 passed; the existing opt-in integration is excluded by default |
| Explicit real Next handler → Python integration | 1 passed, 18 noiseless estimator epochs |
| Python numerical/security/report tests | 186 passed |
| Actual PostgreSQL migration/grant/RLS/RPC checks | 44 passed |
| Separate and combined worker protocol integrations | Both passed, including 18 hash-checked noiseless epochs and unrelated-user denial |
| Full serial Chromium regression suite | 34 passed: all 26 existing cases plus 8 new 3D/branding cases |
| Authenticated browser fixtures | 4 passed: owner/editor/viewer, stale saves and existing login/landing/logout |
| Final targeted 3D / recorded-data checks | Passed after rendering-statistics, native-unit and missing-observation refinements |
| TypeScript / optimized production build | Passed |
| Built-app browser smoke | Passed: actual production 2D/3D, camera presets, mobile width, project stability, cleanup and favicon routes |
| Literal server-credential scan | Source and 36 generated client chunks checked; zero service-role JWT/long secret-key literals |

The production smoke blocks external browser requests and uses no cloud account. Auth/Storage browser and worker protocols are fixtures, not hosted-provider acceptance. Existing SQL policies run against actual embedded PostgreSQL.

## Performance observations

On this Windows host, headless Chromium reported ANGLE/Vulkan SwiftShader. The final 500-object fixture (499 anchors and one receiver) initialized in 3,521 ms, within the documented 10-second target. It used 18 draw calls across the main scene plus orientation HUD, with 14 geometries at the sampled frame. The renderer info counter is collected after both render passes, rather than only the HUD. This is a local software-rendering observation, not a hardware-GPU or mobile-browser performance guarantee.

Repeated 2D/3D switches removed the canvas cleanly, and real pointer-gizmo dragging plus touch orbit passed. Label display is bounded to 80 objects, recorded paths to 2,000 sampled points, rendered links to 1,000 and the text table to 100 rows. Full recorded values remain in saved output.

## Compatibility and scientific boundary

Schema v1, old JSON imports, physical coordinates/settings, seeds, immutable run contracts, saved versions and the approved Phase 2 numerical core are retained. No shared-schema or database migration is required; no hosted data was reset or rewritten. Existing 2D behavior is retained apart from the requested tower branding and the 2D/3D selector. Derived PDF reports now carry the tower in their footer.

This is genuine 3D navigation/rendering of a horizontal positioning model. It is not full XYZ positioning. Unknown anchor/path Z remains absent from canonical data; presentation Z=0 is labelled. Receiver altitude and optional footprint extrusion do not enter measurements, obstruction, covariance or estimators. True surveyed XYZ fields and 3D estimation require a separately approved scientific/data-contract phase.

Camera presets are instant, orbit damping is off, and the orientation indicator is passive; presentation does not introduce camera tween animations. Scientific playback remains user controlled.

## Known limitations

- Full XYZ anchor/path editing, surveyed building elevation, a vertical solver, RF volumes and covariance ellipsoids are intentionally outside this schema-compatible phase.
- Browser coverage is Chromium (desktop and touch emulation). Long-duration GPU/memory soak, all mobile browsers, worst-case combinations of maximum paths/polygons and new hosted multi-user acceptance were not performed.
- The 2D editor retains its existing local-draft behavior; server RPC/RLS still denies viewer publication. 3D additionally prevents local viewer mutations while in that mode.
- Fiber/Drei currently emit the upstream Three.Clock deprecation warning. The existing Python Starlette/httpx deprecation also remains. Neither was suppressed or treated as a passing substitute for an error.

The user subsequently authorized pushing this completed phase. No manual public deployment, hosting configuration, secret rotation or hosted schema operation is part of this update.
