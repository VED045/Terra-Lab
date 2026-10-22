# TerraLab local AI and collaboration update

22 October 2026. This update includes the earlier AI phases and the latest main branch changes. Delivery is to GitHub `main`, using its existing Git-connected deployment integration. No Render deployment or infrastructure change is requested by the user's latest instruction.

## Fixed launcher

The reported failure was caused by an ordinary Next development server on port 3000 owning `.next/dev` for the same app. The local AI launcher attempted another server on 13040 with the same cache/lock, so Next exited. Ollama itself was reachable and was not the cause.

The AI profile now sets an explicit local-profile flag and uses `.next-local-ai` with `tsconfig.local-ai.json`. Browser acceptance uses `.next-tests` with a separate TypeScript configuration. Both output directories are ignored. Normal development and production retain their default `.next` output. The local profile's owned processes are reused; an unhealthy owned service is not duplicated, and a child exit is reported promptly with its actual exit status and bounded diagnostic log tail. Only an owned earlier AI web process can be upgraded; the user's port-3000 process is not terminated.

Actual validation: the reported conflict was found in `web.err.log`; the corrected launcher started on 13040 while the ordinary 3000 server remained reachable. Repeating the launcher reused all three services. Status reported owned/reachable true for the dedicated Ollama, scientific API and web server. Both local web origins returned HTTP 200.

## Identical canvas and navigation

AI Studio now embeds the existing `NetworkCanvas` component, retaining its actual grid, labels, symbols, paths, obstacles, visual layers and calibrated-range baseline. The canvas panel is collapsible and opens for the selected saved project. Its store is isolated from the actual editor: pan, zoom, fit, selection and visual flags remain local preview state. Source geometry, saved configuration and undo history cannot be changed through the preview. Editing controls are disabled there. An unrelated laboratory overlay is not reused in the preview; the baseline is shown at t = 0 s.

**Edit canvas** reloads the currently authorized selected saved project, clears unrelated laboratory viewing state, and opens that project in Network studio. Unsaved editor work requires the existing discard confirmation. Network studio has a visible **AI Studio** button plus its existing navigation link. They save current changes before opening `/ai?project=<the same id>`, preserve drafts on a save error/conflict, and avoid navigating if the project changed while saving.

The actual browser round trip selected one project, opened it for editing, added an anchor, saved through the new AI Studio button, and returned with that same project selected and its new anchor visible. Separate assertions verified the shared renderer, disabled edit tools, keyboard collapse/reopen, view-only immutability and mobile width.

## Honest, cleaner collaboration activity

The old feed displayed every accessible project event as “shared,” including an owner's private saves. The display now includes owned projects only when the current collaboration state contains another person's effective grant, and projects genuinely shared with the current user. Self-membership, an empty team assignment, and pending invitation links alone do not count. Revoked/unknown project references are excluded. Existing server RLS and permissions remain authoritative.

Recent revision saves are grouped by project and browser-local calendar day, with a readable count, latest timestamp, project name and Open project action. With no currently shared projects, the feed explains that private saves remain in project history. Counts summarize the recent events returned by the existing API; this is not an exhaustive audit export. No history was deleted and no database migration or grant change was introduced.

## Verification

| Check                                                  | Result                                                                                                                                                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                    | Passed                                                                                                                                                                                        |
| `npx vitest run --maxWorkers=2`                        | 260 passed, two existing opt-in skips                                                                                                                                                         |
| `npx playwright test --config playwright.ai.config.ts` | Five passed, including real numerical workflows, restricted command execution, cooldown recovery and the canvas edit/AI round trip                                                            |
| `npm run test:e2e`                                     | 52 passed (2.8 minutes), including 2D/3D, mobile, actual scientific output and exports                                                                                                        |
| `npm run test:e2e:auth`                                | Seven passed (54 seconds), with separate browser sessions and actual migrated local PostgreSQL, including no-peer activity, owner/editor/viewer access and revocation                         |
| `npm run test:collaboration`                           | 19 real local PostgreSQL security/lifecycle groups passed                                                                                                                                     |
| Production build                                       | Passed optimized Next.js 16.4.2 webpack build, TypeScript and all 22 page outputs. `TERRALAB_BROWSER_TEST=1 npm run build` used isolated output to preserve both running development servers. |
| Launcher / regular-server coexistence                  | Passed actual start and repeated-start/status checks; both web origins reachable                                                                                                              |
| Patch whitespace                                       | Passed                                                                                                                                                                                        |

The ordinary suites use clearly labeled local provider/Auth/Storage fixtures where applicable; numerical computation and migrated local PostgreSQL permission checks are real. A fresh real native Ollama compatibility request on the repaired running profile also returned toolCalling=true and structuredOutput=true, with freeLocalOnly=true confirmed. Earlier Phase 3 live Qwen tool/chat/experiment evidence is recorded separately in `PHASE_3_REPORT.md`. Hosted user-owned provider acceptance and live Supabase multi-user acceptance are not established by these fixtures.

## User handover and release

Follow [LOCAL_OLLAMA_GUIDE.md](LOCAL_OLLAMA_GUIDE.md) for the full steps. Start with `node scripts/start-local-ai.mjs`, open `http://127.0.0.1:13040/ai`, select/import a local saved project, check Ollama, choose `qwen3:4b-instruct-2507-q4_K_M`, verify tool compatibility, and send a bounded request. `deepseek-r1:8b` remains available for explanation mode; its tool compatibility timed out on this hardware. No Ollama API key, generic coding harness, cloud model or paid fallback is used by the local profile.

Projects stored on port 3000 or the hosted site do not automatically appear on port 13040: export/import project JSON to make an explicit local copy. A remote hosted site cannot directly access this laptop's Ollama; inference stays on the local profile with loopback services.

Release target: GitHub `main`, containing the earlier Phase 1/2/3 work plus these fixes and the latest main README edit. The user explicitly requested GitHub-only delivery and no Render action. The existing main commit had a successful GitHub Vercel status; final release status is checked against the pushed commit.
