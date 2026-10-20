# TerraLab Phase 1 delivery report

> Initial delivery record. Later save/settings, Supabase configuration, profile and sharing updates are documented in `SAVE_SETTINGS_FOLLOWUP.md` and `PROFILE_SHARING.md`; those records supersede the original setup and publication status below.

20 October 2026 · Ready for review

TerraLab is implemented in **`C:\Users\Ved\Desktop\TerraLab`**. It runs locally and provides a functioning scientific network editor, deterministic mobility and validated calibrated-range multilateration. Supabase account/database/storage integration is present but awaits credentials and live acceptance. Phase 2 has not started. No GitHub push has been performed.

## Architecture and file structure

| Location                 | Responsibility                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/app`           | Next.js App Router, design system, layout/error boundary and Next→FastAPI proxy                                                 |
| `apps/web/components`    | Studio shell, SVG coordinate canvas, properties inspector, project/account dialogs and dynamically loaded Plotly chart          |
| `apps/web/components/ui` | shadcn-style Button plus Radix Dialog/Tooltip primitives                                                                        |
| `apps/web/lib`           | Zustand editor/history and local/Supabase project persistence                                                                   |
| `packages/shared/src`    | Zod project/object schemas, coordinate/LOS geometry, deterministic mobility/clock, seeded measurements, QR solver and templates |
| `services/api/terralab`  | Pydantic observation validation, NumPy/SciPy SVD solver and FastAPI health/solve endpoints                                      |
| `supabase`               | PostgreSQL migration, user RLS, private Storage policies and local stack configuration                                          |
| `tests/e2e`              | Playwright acceptance workflows, browser/API boundaries and responsive screenshots                                              |
| `docs/research`          | Seven-document source inventory, methodology matrix, equations and Phase 2 extension contract                                   |

Next.js 16.4.2, React 19.3.1 and strict TypeScript are used with Tailwind, Radix UI, Lucide, Zustand, TanStack Query and Plotly.js. Python uses FastAPI, Pydantic, NumPy and SciPy. JavaScript dependencies are locked; Python requirements are pinned. SVG is the equivalent retained-mode canvas engine. Local use requires no paid service.

## Implemented features

- Navy and light workspaces, dense toolbars, object tree/search, inspector, results/measurements/log panel, keyboard focus and mobile inspector drawer.
- Add transmitters, receivers, buildings/walls, polygons and editable waypoint paths. Select/multi-select, drag, edit coordinates, duplicate/delete, zoom/pan/fit, grid/labels, snap, measure, layers, undo/redo and context actions.
- Persist every object model and its editable parameters. Units are metres; display transforms never change world geometry.
- Six mobility modes with deterministic time, playback, pause, restart, stop/reset, step, speed multiplier and scrubbing. Timestamped truth/estimate samples can be exported as CSV.
- Browser Householder QR and Python SVD solvers using synthetic calibrated ranges. At least three non-collinear usable anchors; redundant observations, rank/conditioning checks and clear failure states. No normal-equation inverse.
- Truth, estimate/error vector, range links, fitted distances, residuals, error and condition metrics. Plotly charts show actual deterministic samples.
- Four real templates: square, six-anchor outdoor site, collinear/poor geometry and moving receiver.
- Local save, autosave, reload, project library, rename/duplicate/archive/delete, timestamps, schema v1 and portable JSON import/export.
- Optional Supabase registration/login/logout, user-owned PostgreSQL project configurations and private JSON Storage snapshots; migration and RLS policies included.

## Run now

Dependencies and the isolated Python environment are already installed on this computer:

```powershell
cd C:\Users\Ved\Desktop\TerraLab
npm run dev
```

Open **http://127.0.0.1:3000**. API docs are at **http://127.0.0.1:8000/docs**. The project scripts choose `.venv` automatically; shell activation is not required. Stop the services with Ctrl+C. For a clean installation, follow the repository README (`npm ci`, create `.venv`, install `services/api/requirements-dev.txt`). Tested runtime: Node 24.19.0 / Python 3.12 / Windows.

For production web mode: `npm run build` then `npm start`. Run the Python service separately when choosing the Python solver engine.

## Environment and Supabase setup

No variables are needed for browser QR and local project persistence. To use Python, the server-only `SIMULATION_API_URL` defaults to `http://127.0.0.1:8000`.

To enable cloud accounts, copy `.env.example` to `apps/web/.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Apply `supabase/migrations/202610200001_projects.sql`, enable email/password Auth and allow localhost/127.0.0.1:3000 URLs. Restart Next.js, register, confirm email if enabled, and sign in. Save templates while signed in to seed the personal cloud library. A free local Supabase configuration is also included; it needs Docker and Supabase CLI.

The README includes exact commands, URL/key locations, migration paths, Auth settings, Storage behavior and a two-user isolation checklist. Service-role keys must never go in browser configuration. **Live Supabase registration, RLS, cloud persistence and Storage were not tested because credentials were unavailable.**

## Tests actually executed

Final verification was run from the requested Desktop folder:

| Check                 | Result                                                                          |
| --------------------- | ------------------------------------------------------------------------------- |
| `npm run typecheck`   | Passed                                                                          |
| `npm test`            | 53 passed                                                                       |
| `npm run test:python` | 20 passed                                                                       |
| `npm run build`       | Passed: production compilation, types, prerender, API route                     |
| `npm run dev`         | Both services start with one command                                            |
| Web / API health      | HTTP 200 / `status: ok`, phase 1, SciPy SVD                                     |
| Playwright Chromium   | 14 passed; includes actual Next→FastAPI request and returned-estimate rendering |
| Visual review         | Desktop dark/light, project library and 390 px mobile inspected                 |
| Live Supabase         | Not run; setup required                                                         |

Tests cover coordinate transforms, geometry, noiseless known-position recovery, redundant observations, large coordinate offsets, degenerate/ill-conditioned layouts, invalid ranges, motion/clock, serialization, persistence, state validation, history and critical editor operations. Browser acceptance includes add/edit/save/reload, undo/redo, mobility controls, paths/polygons, project lifecycle, drag/multi-selection, autosave during playback, themes and responsive layout.

The mock-response E2E test separately confirms response values reach the UI; it does not replace the real API integration test. The Python suite emits one nonblocking upstream Starlette/httpx deprecation warning. Earlier typing, hydration, hit-testing and autosave failures were fixed; the progress document records them. There are no unresolved local test failures.

## Known limits

- This is a horizontal calibrated-range simulator. It does not estimate unknown receiver clock bias or reproduce a radio waveform. RF/timing/clock/altitude properties are saved metadata. Range sigma is the active Phase 1 noise parameter.
- LOS uses geometric intersections; no attenuation, multipath, NLOS range bias or advanced propagation. With obstruction exclusion disabled, obstructed links still carry ideal synthetic ranges.
- Live preview uses browser QR. Explicit Python runs use SVD and render returned estimates. Historical plots/CSV use a bounded window of up to 400 deterministic sample timestamps at `max(step, 0.5 s)` intervals. No unlimited results database is claimed.
- Local storage is browser/origin specific. Export JSON for backups. Cloud accounts, policies and Storage require live validation before use.
- Cross-browser testing beyond Chromium and public deployment hardening are outside the executed verification. No internet deployment or GitHub push has occurred.

## Short manual acceptance checklist

1. Start both services. Open the project library, choose **Four-anchor square**, edit a transmitter and move the receiver.
2. Set all transmitter range noise sigmas to zero. Run the baseline; expect position error and residuals near machine precision. Inspect the measurement table.
3. Switch to Python SVD and run again. Inspect the valid-fix state; confirm the `/api/solve` request succeeds.
4. Create/select/drag/duplicate/delete objects. Undo and redo; zoom and fit. Confirm world coordinates stay unchanged when zooming.
5. Draw a polygon and a trajectory, press Enter to finish. Edit path points, reverse/loop and assign a receiver to the path.
6. Open **A receiver in motion**. Play/pause, step, scrub and stop. Revisit a timestamp and confirm the same truth/estimate. Export CSV.
7. Save, reload, rename, duplicate, archive and delete a saved test project. Export/import JSON and check coordinates, settings and layers.
8. Open **Geometry matters** and confirm a clear no-fix diagnostic. Toggle light mode and test the mobile properties drawer.
9. Once Supabase is configured, use two accounts to verify Auth, save/reload, CRUD, RLS and private Storage ownership.

## Exact next steps for Phase 2 — approval required

1. Review Phase 1 and complete the pending live Supabase acceptance. Preserve current deterministic fixtures and solver contracts.
2. After explicit approval, specify separate TOA/pseudorange, TDOA and calibrated RTT observation schemas, including receiver clock state and calibration assumptions.
3. Add controlled timing noise, fixed hardware offsets, clock drift, positive NLOS bias and missing observations with recorded seeds. Keep the Phase 1 calibrated-range baseline intact.
4. Add approved estimation/refinement methods and matched-dataset comparisons with documented residual/weight assumptions; no accuracy promise before evaluation.
5. Define and approve the experiment/reporting protocol before Monte Carlo studies or advanced multiband/CSI/hardware work.

**Stop at the Phase 1 review gate. No Phase 2 algorithms, comparisons, experiments or collaboration features have been implemented. GitHub origin is configured for the user's later push.**
