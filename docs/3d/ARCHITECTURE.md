# Optional 3D workspace

Phase 4B adds a client-only renderer to the existing studio. The SVG editor remains the default; selecting 3D loads the graphics code. No second application shell, project manager, solver or database is introduced.

## Components and ownership

| Module | Responsibility |
|---|---|
| components/network-canvas.tsx | Existing SVG renderer, tools and gestures; preserved |
| components/network-3d.tsx | Accessible 3D controls, WebGL fallback, status, recorded-value table |
| components/scene-renderer.tsx | Fiber scene, instanced objects, cameras, orbit controls, translation gizmo, line batches and projected labels |
| lib/scene-model.ts | Pure coordinate conversion, supported translation, bounds and exact recorded-data extraction |
| lib/scene-view.ts | Ephemeral mode/camera/layer/display state, outside Project |
| lib/store.ts | Existing canonical project, selection, undo/redo and edit/save transactions |
| lib/research.ts / persistence.ts | Existing access index, versioned saves and optimistic-conflict behavior |

React DOM renders projected labels in the existing application root. Drei Html was rejected after browser testing showed synchronous nested-root unmount warnings with React 19.3. Labels are capped at 80 objects; every object remains accessible in the shared tree. Camera projection updates label positions without changing project data.

Anchors and receivers use two InstancedMesh objects. Stored trajectories and measurement links use batched buffer geometry with vertex colors; non-used links also use dashed material. Updating same-size buffers reuses their attributes; resizing disposes old GPU buffers. Custom obstacle geometry is disposed on replacement/unmount. Fiber owns renderer/primitive disposal, and the context-loss listener is removed on unmount. Demand rendering is used when playback is paused; active playback uses the existing shared clock.

## State and science

The same project and selection back both renderers. Edits use existing store transactions and save RPCs. View mode, 3D camera, grid, ground, coordinate planes, unit scale, illustrative extrusion, visibility and snapping preferences are not added to serialized schema v1. New browser sessions start in 2D. Switching does not change the seed or submit a numerical job.

The live preview uses the existing browser baseline and its actual horizontal measurements. When a saved result is active, the 3D overlay reads the selected record/frame. It never calls a solver to recreate recorded values. Null positions remain missing fixes; failed epochs break estimate trajectories. Snapshot geometry must match the canonical network. Recorded epoch/estimator, original link values, residuals and statuses are exposed in text, not just color.

Scientific geometry stays on the labelled XY presentation plane. Receiver altitude can be displayed as metadata; optional obstacle extrusion is illustrative. Neither changes measurement equations, obstruction tests, errors or uncertainty. Only the stored XY ellipse can be drawn; no covariance ellipsoid or vertical solution is inferred.

## Access and concurrent saves

Cloud ownership/editor/viewer roles come from the existing authenticated workspace index. Until access is known, cloud 3D editing fails closed. Viewer edits, creation, duplicate/delete, undo/redo and saves are blocked in 3D, including keyboard mutations through the shared store. Selection, inspection and camera movement remain available.

The existing 2D local-draft behavior is retained: a viewer may inspect or alter a local draft, but checked save/run RPCs deny unauthorized publication. Server RLS/RPC authorization remains the security boundary in both views. UI restrictions are not a replacement for it. Revocation and a stale expected version are checked by the same backend; an unsuccessful save retains unsaved edits. Save-copy recovery uses the dashboard's existing fresh-project operation.

## Compatibility and dependencies

Pinned packages: three 0.186.1, @react-three/fiber 9.8.2, @react-three/drei 10.7.9, @types/three 0.186.0. Fiber's declared React range includes the installed React/ReactDOM 19.3.1; Drei requires Fiber 9 and React 19. Next 16.4.2 loads the renderer through client-side dynamic imports with SSR disabled.

No schema migration, hosted-data rewrite or scientific-core update is required. Full XYZ data and full 3D estimation are separate proposals; see COORDINATE_MODEL.md.

Sources checked: [Fiber installation](https://r3f.docs.pmnd.rs/getting-started/installation), [Drei transform controls](https://drei.docs.pmnd.rs/gizmos/transform-controls), [Three resource cleanup](https://threejs.org/manual/en/cleanup.html). Package peer ranges were also checked directly with npm before installation.

## Branding

apps/web/public/brand/network-tower.svg is the canonical logo. The shared NetworkLogo component uses it in studio navigation and Research workspace. Browser metadata references it as the SVG favicon. scripts/generate-brand-assets.mjs produces the multi-size ICO, Apple icon and report PNG from the same source. The PDF footer and end-user README use this identity; object-type icons and personal profile avatars retain their own meaning.

The orientation gizmo is a passive indicator; keyboard-accessible camera presets change views instantly. Orbit damping and camera tweens are disabled, so presentation adds no animated transitions requiring a reduced-motion setting. Scientific playback remains explicitly user controlled.
