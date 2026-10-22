# AI Studio UX enhancement

22 October 2026. Started from clean `main`, `2f90a23`; origin is `VED045/Terra-Lab`. Existing phase reports were checked against source. The user's follow-up explicitly authorizes pushing completed changes. Production settings and Render remain untouched.

## Stage 1

Implemented a compact workbench, optional context region, inline activity flow with real tool states and expandable actual results, elapsed time, reduced-motion styling, and explicit failure/cancellation states. A completed model turn does not imply an approved mutation or completed experiment. Existing streaming, stop/retry, review tokens and task recovery remain intact.

The actual NetworkCanvas renderer has expanded, compact and hidden modes. A safe local layout preference survives reload; conversation drafts survive layout changes. Its scoped view store survives hide/collapse, and scientific geometry remains sourced from the selected authorized saved project. Edit canvas retains the existing project-preserving Network Studio round trip.

Provider setup explains free local weights and hosted billing separately. API reachability/model listing, opt-in generation and tool/JSON compatibility are distinct checks. Concurrent health checks are deduplicated in the UI. Only transient network/timeouts get one retry after one second; permanent failures require a manual repair. Generation uses existing rate/admission bounds and exposes no response content or keys in diagnostics. There is no automatic download/provider/model fallback.

## Stage 1 verification

- Baseline: 260 unit tests passed, two existing opt-in skips; typecheck passed; all five actual-route AI browser tests passed.
- Updated: 262 unit tests passed, two skips; typecheck passed; 222 Python tests passed; six AI browser tests passed using Chromium, origin `http://127.0.0.1:13042`, fixture Ollama protocol and the real numerical API/restricted test process.
- Database: 60 real local PostgreSQL/RLS checks passed. Collaboration: 19 security/lifecycle groups passed.
- Isolated production build passed (Next 16.4.2 webpack); no numerical schema/tolerance changes.
- Desktop/mobile screenshots inspected. Removed composer overlap based on screenshots. Keyboard canvas toggle and width assertions pass; mobile reduced-motion/dark screenshot captured. Hosted provider generation is not tested without a user-owned key.

The initial browser rerun caught duplicate status regions, corrected without changing assertions. A subsequent study approval hit the existing shared operation budget after health checks were added to it; health listing no longer spends mutation/tool capacity. Generation still uses the existing budget. The complete six-test suite then passed, including cooldown recovery.

Changed areas: `components/ai-studio.tsx`, `ai-project-canvas.tsx`, new `ai-agent-activity.tsx`, `app/ai.css`, `api/ai/connection/route.ts`, `lib/ai/connection-state.ts` and focused unit/browser tests. No dependency or migration in Stage 1.
