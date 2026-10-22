# AI Studio and TerraLab Manuscript follow-up

22 October 2026. User-authorized update, GitHub main, C:/Users/Ved/Desktop/TerraLab.

## Fixed database configuration

The deployed Terra-Lab Supabase project was missing the research tables, private bucket and public.research_workspace_index(uuid). Existing project/collaboration prerequisites were inspected first. Applied the repository's additive 20261022115124_research_workspace.sql migration, notified PostgREST to refresh its schema, and aligned the MCP-generated migration history version with the existing repository migration version. No project, manuscript, experiment or user data was deleted.

Actual hosted PostgreSQL verification confirmed all five research tables have RLS, research-library is private, anonymous execution is denied and authenticated execution is granted. An authorized owner-role transaction created/read a test manuscript and verified its immutable revision and audit record; the entire transaction was rolled back. This tests the live database policies/RPCs, not a real browser Auth login. Security advisors identify five new intentionally authenticated, guarded SECURITY DEFINER RPCs; the pre-existing password-protection setting was left unchanged.

## Updated interface

- Fixed the malformed dashboard Research link by using the existing navigation class. It is now labelled Manuscript.
- Renamed the document page TerraLab Manuscript. The compact header and toolbar lead into a project file library, line-numbered main.tex editor and independently scrolling live math/structure preview. Source, split and preview layouts, autosave, source fidelity, revisions, recovery, evidence and explicit sharing remain intact. This is still a math preview, not a full TeX/PDF compiler.
- AI Studio uses a viewport workbench with independently scrolling context, transcript and review/composer areas. The transcript has its own visible scrollbar, follows streamed content, stops following when the reader scrolls upward and follows again on a new request.
- Starter prompts and research workflows are in dismissible left-sidebar panels. Restore buttons and a small versioned preference preserve this choice; hiding workflows does not cancel a submitted job or erase its journal.
- Response boxes render escaped headings, emphasis, lists, tables, quotes, links and code. No imported HTML is executed. Executable/backslash/control-character links are rejected. Incomplete streaming markup remains text. Progressive typing and a caret use actual received text, not invented content; reduced motion disables animation.
- Agent activity displays real tool/approval/run states with connected markers. Only an active transition gets the glowing meteor streak; completed, waiting, cancelled and failed states remain truthful. Motion stops when the turn stops and is disabled under reduced motion, including pseudo-elements.
- The actual NetworkCanvas toolbar is vertical at the left. Scientific tools and geometry are unchanged. The read-only preview measures its real height, fits with preview-appropriate padding and no longer clips a taller canvas inside compact mode. User pan/zoom still survives hide/restore.
- Workspace theme is restored from a validated, versioned visual preference or the last active project, and follows existing store changes. AI chrome and its preview use the same current theme, including across reloads. No geometry or permission is loaded from this preference.
- /api/version returns only the build's public commit SHA and runtime mode. Vercel's Git commit metadata is used in production; local Next startup records the checkout's SHA. No credentials or environment dump is exposed.

## Verification

- npm test: 277 passed, two opt-in skips. Three new response-rendering tests cover semantic formatting, HTML/link safety and incomplete stream markup.
- npm run typecheck and production webpack build: passed.
- Existing AI browser suite: twelve passed. Two new acceptance cases passed; affected layout/canvas checks were rerun after the final preview correction. Together these cover fourteen distinct AI/Manuscript browser cases.
- npx playwright test: 52 passed, including real numerical flows, pointer editing, vertical toolbar access, 2D/3D, mobile and existing palettes.
- npm run test:e2e:auth: eight passed with separate fixture accounts, actual PostgreSQL RLS and simulated Auth/PostgREST. Owner/editor/viewer and revocation flows remain enforced.
- npm run test:research: 23 real PostgreSQL/PGlite security groups passed. These local fixtures are distinct from the hosted verification above.
- Actual Chromium -> local Next 13040 -> Ollama 11435 -> downloaded Qwen Instruct completed an explanation response through the new renderer, with no hosted provider. The first smoke script incorrectly treated Retry availability as success after selecting the model re-enabled agent mode. Its screenshot exposed a real tool-format failure; the corrected script explicitly selects explanation mode and requires a completed response, no error alert and nonempty model text. No tool-capability claim is inferred from this explanation check.
- Desktop/mobile, light/dark/palette screenshots were inspected. Browser tests verify sidebar dismissal/restoration, source fidelity, semantic response formatting, scroll follow/pause/resume, vertical tools and both active meteor and reduced-motion styles.

Screenshots and the post-push verification record are delivered under outputs/TerraLab-Workbench-v2 in the Codex workspace. The commit marker is stable across configuration loads; a per-load timestamp was removed after it disrupted a cold development route transition. The post-push check waits for /api/version to match the pushed commit, then checks real production routes and the scientific API. Browser checks use an isolated profile; no existing signed-in Chrome session was available. No paid model, production key change or manual Render deployment is involved.

## Local versus deployed code

The checkout initially matched origin/main at c2a882b. Both local ports 3000 and 13040 reported that revision when the version endpoint was introduced. The ordinary app and free AI profile have different ports, browser stores and provider configuration; that does not mean different Git source. After committing, restart verified TerraLab processes and compare /api/version with git rev-parse HEAD and the deployed endpoint. A hard refresh clears an already-open tab's stale client modules.

The free local profile remains loopback only, with downloaded weights, cloud inference disabled and no API key required. The deployed website still cannot directly access a laptop's Ollama. The model interface, restricted runner, scientific solvers and reviewed action authorization are unchanged.
