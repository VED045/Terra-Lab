# Phase 4B initial audit and implementation plan

Audit completed before implementation. Baseline: e98c421; clean working tree.

## Existing contracts

- Schema v1: every object has XY metres. Only receivers have altitude, explicitly metadata; anchors have no Z. Paths and polygon vertices are XY. Obstacle width/height are horizontal dimensions, not building elevation. No surveyed 3D geometry exists.
- SVG uses X east/right and Y north/up, with screen Y inverted. Geometry, blockage, mobility, browser QR, Python equations, Jacobians/covariance and experiment observations are horizontal. Position arrays and uncertainty ellipses do not establish a vertical estimate.
- Existing immutable records contain truth/position XY, frames, actual observation coordinates, missing/NLOS flags, rejected indices, residuals, estimator/epoch and hashes. Render these values; do not run a replacement solver for recorded output. Snapshot overlays require matching canonical objects.
- Zustand owns selection, edits, bounded undo/redo, playback and project state. Autosave, accepted-save reconciliation and optimistic cloud versions remain shared. Checked RPCs/RLS enforce owner/editor/viewer permissions independently of rendering mode. Local browser drafts are not authorization to publish cloud changes.
- The existing SVG renderer, its tools/gestures/context menus, canvas camera settings, live 2D inspector and laboratory plots remain 2D components. 3D gets its own camera, navigation, transforms and view preferences; no new application shell or project manager.
- Methods reviewed: PHASE_2_METHODS.md and research/methodology-matrix.md; architecture/database contracts and recorded laboratory overlays reviewed. No 3D positioning, slant range, RF volume or covariance ellipsoid is justified by the present data.

## Plan

1. Add React-19-compatible pinned Three/Fiber/Drei dependencies. Lazy-load a separate WebGL renderer only on explicit 3D selection. New sessions always start 2D.
2. Share canonical objects, selection, transactions and immutable results. Keep 3D camera, layer toggles, grid/unit scale and illustrative obstacle extrusion in separate view state, absent from serialized projects/revisions. Use right-handed Three coordinates [east, up, -north].
3. Add orbit/pan/zoom, perspective/orthographic cameras, fit/reset/top/front/side views, coordinate axes/planes, scale labels, selection, XY translation/snapping, shared inspector and supported object creation/duplication/deletion. Receiver altitude edits use its existing metadata field. Z is explicitly unavailable for anchors/paths/obstacles; their presentation plane is z=0, not a survey claim.
4. Draw actual stored truth/estimates, trajectories, error/residual links, status indicators and the existing XY ellipse only when present. Recorded scientific geometry stays on z=0 even when receiver metadata elevation or illustrative obstacle extrusion is displayed.
5. Add unavailable/loading/error/context-loss recovery, touch/keyboard controls, efficient repeated meshes, bounded labels/overlay traces, disposal and documented performance observations.
6. Establish a single network-tower SVG source, shared brand component, favicon and generated compatible icon assets. Preserve the rest of the 2D appearance.
7. Add conversion/edit/recorded-data tests and browser coverage for switching, selection, transforms, persistence, permissions/conflicts, fallbacks and large scenes. Run existing regressions, typecheck/build and document actual results.

## Schema and approval boundary

No shared schema change, database migration or solver change is required for this supported planar visualization/editing scope. Missing anchor/path Z means a presentation plane at zero; it remains absent from exported canonical data. Receiver altitude remains metadata and never becomes an estimated Z.

True per-anchor/path Z, surveyed building elevation and full XYZ estimation are not implemented. They would require a proposed backward-compatible schema/API/database validation migration, measurement equations and independent scientific validation, and must stop for explicit approval before implementation.

Do not push, deploy, migrate hosted data or start a next phase. The Phase 4B brief explicitly overrides earlier push authorization.

## Later user authorization

After the initial audit, the user explicitly requested pushing the completed and verified changes. That supersedes the no-push boundary. Do not manually change hosting, secrets or hosted schema. The supplied README is to be adapted for end users, excluding deployment and Supabase migration steps.
