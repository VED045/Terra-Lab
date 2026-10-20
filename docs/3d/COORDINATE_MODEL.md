# Coordinates, display units and vertical limits

## Domain and rendering coordinates

Canonical project coordinates remain horizontal Cartesian X east and Y north, in metres. Three uses a right-handed Y-up scene:

| Domain | Three coordinate |
|---|---|
| X east | +X |
| Y north | -Z |
| Z up (presentation/receiver metadata only) | +Y |

For scale u metres per scene unit, the conversion is [x/u, z/u, -y/u]. The inverse is x=X*u, y=-Z*u, z=Y*u. Unit conversion never changes stored coordinates, noise, clock values or measurement units. Metre, centimetre and kilometre scene-unit choices change renderer units consistently; all inspector/readout values remain labelled in metres.

The grid is a visual reference with a chosen metre spacing. Its zero is the existing project origin. Camera orientation, zoom, grid, coordinate planes and scale are view-only. XY translation snaps absolute target coordinates, not pixel deltas. A path translation shifts all waypoint points by the same XY delta. Undo/redo records one committed transform.

## What Z means for each object

| Object or result | Vertical rule |
|---|---|
| Anchor | No Z field exists. Display at presentation Z=0; this is not a surveyed elevation. Z translation is disabled. |
| Receiver | Existing altitude is metadata. Default display is planar; an explicit toggle can show metadata elevation. Z translation updates only altitude, never a positioning state. |
| Obstacle | Existing width/height are the east–west and north–south footprint dimensions. They are not physical elevation. Optional display extrusion defaults to zero and is explicitly illustrative. |
| Trajectory / polygon vertex | XY only. Display at Z=0; no Z value is inserted into imports or exports. |
| Stored truth / estimate / observation anchor | Render recorded XY at presentation Z=0; scientific Z is unestimated. A receiver metadata toggle does not move these scientific links or estimates vertically. |
| Uncertainty | Render only an existing recorded XY ellipse, with its recorded angle in radians. No ellipsoid is generated. |

Missing vertical fields remain absent in canonical JSON. Existing schema-v1 projects and old imports remain valid without data migration. A view cannot upgrade missing Z to a measurement.

Initial-coordinate editing retains existing mobility semantics. The translation gizmo edits at t=0 while paused. For waypoint receivers, the recorded/live route follows trajectory points rather than the receiver's unused initial XY; translate or edit the path to move that route. Obstruction and all scientific range/bearing/covariance calculations remain horizontal.

## Future scientific phase, not implemented here

Surveyed anchor Z, path-point Z and physical building elevation need an explicitly approved compatible data contract, import/migration rules, UI units and database/API validation. A missing value should remain unknown rather than silently measured as zero.

True 3D estimation additionally needs model-specific equations and enough independent observations for the chosen state, including receiver clock states where appropriate. The 3D Jacobian must be full rank and well conditioned; coplanar geometry, vertical ambiguity and insufficient anchor distribution must produce documented diagnostics. Separate deterministic and noisy benchmarks, covariance/coverage checks and backward-compatibility acceptance would be required. Phase 4B does not change or claim those capabilities.
