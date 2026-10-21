# AI Studio provider setup

AI Studio is `/ai`, linked from Network studio and the project library. It discusses **saved** project configuration. Save the current network before opening it, select the project, check the connection, then choose a returned model. It does not execute experiments or modify the network.

## Signed-in DeepSeek users

1. The administrator configures the existing Supabase public URL/key and a server-only `TERRALAB_AI_COOKIE_KEY` on the Next.js runtime. Use a cryptographically random 32-byte value, encoded as canonical base64. One way to generate it locally is `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Transfer it through the host's secret settings; do not commit it or prefix it with `NEXT_PUBLIC_`.
2. Serve the application over HTTPS. Sign in using the existing TerraLab account interface under Projects. Open AI Studio → Provider settings. If encryption is unavailable the UI explains the missing configuration; it does not save plaintext credentials as a fallback.
3. Obtain your own API key from the [DeepSeek platform](https://platform.deepseek.com/). DeepSeek receives chat messages and the minimized project summary. Its account may bill you for generation; TerraLab does not provide inference credit or a shared key.
4. Enter your key in the password input and choose **Verify & save key**. TerraLab calls the official model-list endpoint before saving. The input clears immediately; settings responses never contain the literal key. A verified list is not proof of available balance or successful text generation.
5. Choose **DeepSeek API**, check the connection if needed, and manually select a returned model. Model names are discovered, not scattered through UI code. Send a starter prompt. **Stop response** cancels the stream; **Retry response** is an explicit new request and may incur another provider charge.

Saving creates an AES-256-GCM encrypted HttpOnly cookie bound to the verified user ID, scoped to this host and browser, expiring after seven days. It is not an account-synchronized vault. Another member of the same project cannot decrypt or use it. Forget removes this browser's saved credential. Provider-side revocation is required to invalidate an already stolen/replayed credential or sessions on other devices. Rotating the administrator's encryption key invalidates all existing AI credential cookies.

This phase supports one hosted API provider, DeepSeek, plus optional local Ollama. OpenCode Console and other providers were researched but are not silently routed through the DeepSeek adapter. See the architecture document before adding one.

## Explicit local development

In the ignored `apps/web/.env.local`, configure:

```dotenv
TERRALAB_AI_LOCAL_DEV=1
TERRALAB_AI_DEV_DEEPSEEK_KEY=
```

Set the second value to **your own** key through your local secret-editing workflow, then run `npm run dev:web`. Do not post the key into chat. Open TerraLab through `http://127.0.0.1:3000`, with no signed-in cloud session when using this local-only mode. `NODE_ENV` must be `development` and the received Host must be loopback. Bind the dev server to loopback as the existing script does. This mode is for one local operator, not shared hosting or a tunnel.

The local UI does not save a browser key: it uses only the explicitly configured developer-owned environment value. That value is ignored for authenticated cloud users and in production. A supplied invalid JWT never falls back to local mode. Without the local opt-in, unauthenticated users must sign in even if an environment key happens to exist.

Local project snapshots are validated using the existing project schema and must match the selected project ID. They are labeled local development data, not cloud-authorized facts. In cloud mode the server ignores any submitted local snapshot and reloads the project through the caller's RLS context.

## Optional Ollama

Install Ollama yourself, review the chosen model's license and hardware requirements, and manually install a text model appropriate to your computer. TerraLab never downloads one or assumes GPU/RAM capacity. On the same machine as the local Next.js server, set:

```dotenv
TERRALAB_AI_LOCAL_DEV=1
TERRALAB_AI_OLLAMA_ENABLED=1
TERRALAB_AI_OLLAMA_URL=http://127.0.0.1:11434
```

Start Ollama, restart Next.js after changing environment configuration, choose **Ollama (local, optional)**, then **Check connection** and select an installed model. TerraLab lists `/api/tags`, checks `/api/show` for `completion`, then streams `/api/chat`. Embedding-only models fail with an actionable message. No Ollama API key is needed for this local route. The URL is server configuration, not an arbitrary user-supplied proxy target; only loopback HTTP origins are accepted and redirects are rejected.

The server must be local to Ollama. A Vercel or Render server's localhost refers to that remote server, not your desktop. Phase 1 disables Ollama in production; a future authenticated local bridge needs a separate security design. Ollama Cloud is not silently substituted.

Official setup/protocol references: [Ollama quickstart](https://docs.ollama.com/quickstart), [installed models](https://docs.ollama.com/api/tags), [model capability check](https://docs.ollama.com/api-reference/show-model-details), [chat](https://docs.ollama.com/api/chat).

## Failures and recovery

| State                              | What to do                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| Sign-in/session failure            | Open Projects → account, sign in again; no environment fallback occurs.                    |
| No key                             | Save your own key, or explicitly configure your single-user local development environment. |
| Invalid/revoked key                | Replace it under Provider settings. An unsuccessful save preserves the previous cookie.    |
| Balance/quota exhausted            | Review your provider's account and spending limit; TerraLab makes no billing changes.      |
| Rate limit                         | Wait and explicitly retry.                                                                 |
| Provider down / Ollama unavailable | Check provider status or start your local runtime.                                         |
| Unsupported/unlisted model         | Check the connection again and choose a listed text model.                                 |
| Timeout or truncated response      | Treat partial text as incomplete; shorten the question or retry.                           |
| No project/access denied           | Save and select an accessible project. Access is checked again for every turn.             |

## Tests

`npm test` is deterministic and does not call a paid model. Existing environment-dependent scientific integration tests remain separately opt-in.

`npx playwright test --config playwright.ai.config.ts` runs an isolated local Next.js server plus an explicitly named Ollama **protocol fixture**. It verifies the browser → API → summary → streaming path, including cancellation, unsupported models and outage states. This fixture is not an AI model or evidence of live inference.

For a deliberate real-provider smoke test, set `TERRALAB_AI_SMOKE=1`, `TERRALAB_AI_SMOKE_PROVIDER=deepseek`, `TERRALAB_AI_SMOKE_MODEL` to an ID available to your account, and your own `TERRALAB_AI_DEV_DEEPSEEK_KEY` in the process environment. Then run:

```text
npx vitest run apps/web/lib/ai/smoke.test.ts
```

It performs model discovery and one text request and **may bill your account**. It does not print keys or model output. The terminal command does not automatically load Next.js `.env.local`; supply secrets through the process environment. The smoke test remains skipped unless explicitly enabled. For Ollama adapter smoke tests, the process also needs `NODE_ENV=development`, both local opt-in flags, an installed completion model and `TERRALAB_AI_SMOKE_PROVIDER=ollama`. No live smoke test was enabled during implementation.
