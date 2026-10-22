# Local models and simulator context

22 October 2026. Stage 2 chooses the brief's option 3: the existing loopback-only TerraLab runtime. No browser-to-Ollama public proxy or unsigned companion is introduced. This is deliberate: a companion would also require a separately designed browser relay for the existing server-side reviewed agent, pairing/revocation, packaging/signing and cross-browser permission acceptance. Changing CORS alone would not provide these boundaries.

## Supported route

From the TerraLab repository on this Windows laptop:

```powershell
node scripts/start-local-ai.mjs
node scripts/start-local-ai.mjs --status
```

Open `http://127.0.0.1:13040/ai`. Select/import a local project, choose Local Ollama, check connection, select `qwen3:4b-instruct-2507-q4_K_M`, open Provider settings and Test generation. Verify tool compatibility separately before agent work. DeepSeek R1 8B remains an explanation option; its earlier tool probe timed out. There is no automatic model/provider substitution, cloud billing or model download. An Ollama account key is unnecessary.

The launcher owns a dedicated Ollama at `127.0.0.1:11435`, numerical API at 18040 and web server at 13040. Desktop Ollama 11434 is a separate instance. Use launcher status/logs to diagnose the configured instance, rather than changing ports blindly. Stop/revoke the entire local runtime with `node scripts/start-local-ai.mjs --stop`; only verified owned processes are stopped. Local browser data is origin-specific; export/import project JSON between the hosted site, port 3000 and 13040.

The hosted site's Local Ollama guide opens the supported local mode; it does **not** detect or call the laptop. No local model presence authorizes hosted inference. [Ollama configuration](https://docs.ollama.com/faq) controls its origins/bind address; [Chrome Local Network Access](https://developer.chrome.com/blog/local-network-access) imposes browser permission restrictions. Neither is bypassed. No public/LAN binding, wildcard CORS, tunnel, pairing token or remote-origin bridge exists in this delivery. Direct deployed-HTTPS-to-local inference is **not implemented or verified**. The simulator and document workspace work independently of model connectivity.

## Connection diagnostics

API/model-list checks have a 15-second deadline; only transient reachability/timeouts receive one UI retry after one second. A manual retry remains available. Local generation has its existing 180-second budget; hosted generation uses 45 seconds. Generation is opt-in and rate/admission bounded. Listing success is not generation success; compatibility probes separately test formal tools and structured JSON. Disabled transport, unreachable provider, timeout, empty/missing weights, cloud-backed weights, invalid credentials and quota failures have repair guidance. No secret or model reasoning is logged by these checks.

## Context correctness

The typed read-only service reauthorizes cloud project reads through the JWT/RLS client. It supplies saved snapshot revision, units, counts, simulation configuration and at most eight receiver geometry diagnostics. Exact geometry is sent only for up to three selected entities, with trajectory samples capped at sixteen points each. Untrusted labels are omitted. View metadata is browser-labelled, and stale revision/selection is rejected. Unsaved editor snapshots are explicitly labelled and never become mutation authority. All approved changes continue to use fresh saved state, signed review and existing checked domain operations.

Context switches control canvas, selected entity, saved configuration and experiment results. Excluded categories block related inspection tools and are redacted in the mandatory initial project inspection. The existing result tools still provide actual bounded metrics/samples and source IDs when enabled. The service never invents viewport bounds, missing measurements or unseen results. Raw measurement datasets and whole canvases are not sent by default.

## Verification

- Isolated Playwright Chromium (not the user's Chrome profile): deployed `https://terra-lab-wine.vercel.app/studio` and `/ai` returned HTTP 200. Same routes on `http://127.0.0.1:13040` returned 200.
- Actual launcher started all three owned local services from a stopped state. No weights downloaded.
- Actual Chromium → Next 13040 → Ollama 11435, Qwen Instruct: generation passed in 9,542 ms; formal tool/structured JSON compatibility passed by 34,840 ms total. No hosted key used. Screenshot: `outputs/ollama-context-verified.png` in the delivery workspace.
- Deterministic Chromium at 13042: seven actual-route AI workflow tests passed, using explicit protocol fixture responses and the real numerical API/restricted test process. Added saved/unsaved/stale/exclusion coverage. Three affected tests rerun after the final live-state/redaction correction passed.
- 264 unit tests passed, two opt-in skips; production build/typecheck passed. Existing real worker and combined-supervisor flows passed. Stage 1's 222 Python, 60 database and 19 collaboration checks remain applicable to unchanged scientific/authorization infrastructure.
- Hosted DeepSeek generation not tested: no user-owned DeepSeek key. No paid call, production setting change or Render operation.

Changed areas: `lib/ai/canvas-context.ts`, context/contracts/agent/tools/server, AI Studio context controls and focused tests. No dependencies or database migration in Stage 2.
