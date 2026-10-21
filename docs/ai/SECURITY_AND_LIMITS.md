# AI Studio security and limits

## Enforcement

- All AI API routes verify same-origin requests. Mutations require an exact Origin/received-Host match; production requires an HTTPS origin. Same-origin browser GETs can use Fetch Metadata. Forwarded host/protocol headers do not select a trusted origin. There is no permissive CORS endpoint.
- `getUser(jwt)` verifies the Supabase user on the server; client session state is used only to transport the JWT. A fresh user-scoped Supabase client uses the public key and caller JWT, never a service key. Existing project SELECT RLS remains the authorization authority. No `user_metadata` field is trusted for permissions.
- Cloud context queries only the chosen project's `config`. An optional `experimentId` is additionally constrained by that project ID and existing job RLS. No membership, peer profile, invitation, notification, arbitrary table or result-artifact access is added. Missing access fails closed before inference. Read-only context is available to authorized viewers as well as editors/owners.
- The provider sees only validated entity counts, enabled counts, mobility types, selected simulation fields and bounded experiment configuration. It receives no project names/descriptions, owner/member identities, coordinates, arbitrary metadata, raw measurements or result rows. The UI separately uses the existing project-list API so the user can choose a project. Shared project members use their own provider credential.
- Cloud requests never trust a browser project snapshot. Only explicit loopback development allows a validated local snapshot. That single-operator path is disabled in production, requires opt-in and is never an authentication-failure fallback.

## Credential mechanism

Keys are accepted once through an uncontrolled password input, cleared immediately after submission, and never copied into React state, localStorage, IndexedDB, project metadata or analytics. The form explains the recipient and potential billing. Saving verifies the model endpoint first. The only persisted credential is an AES-256-GCM ciphertext cookie with a random 96-bit nonce, authenticated tag, seven-day expiry and user-ID additional authenticated data. It is HttpOnly, SameSite=Strict, Path=/, host-only, and Secure with a `__Host-` name in production. The 32-byte encryption key is server-only environment configuration. No schema migration or shared paid key exists.

Settings GET returns flags, not a masked secret suffix or literal key. Decryption with another user's ID, tampering, expiry, missing configuration or key rotation fails closed. A configured cookie is never presented as a proven provider connection. Failed verification does not replace a previously saved credential. Forget expires the browser cookie; logging into another account cannot decrypt the previous account's key. Auth changes also clear AI conversation/context state and discard stale asynchronous UI responses.

The server handles plaintext only transiently to construct the authorized provider request. It strips that key from outgoing prompt content and response text, retaining possible prefixes across stream chunks to prevent split-token disclosure. Upstream exception bodies, stack traces and URLs are not returned. Error messages are static and actionable. Only text deltas are forwarded, never reasoning/tool-call payloads. Responses use `Cache-Control: no-store, private` and vary by Authorization/Cookie. No AI telemetry or request logging is introduced.

The cookie is encrypted client-held persistence, **not** a centralized secret vault. It does not synchronize between devices and has no per-cookie server revocation list. A stolen ciphertext plus the matching valid account session can be replayed until expiry; provider-side revocation or administrator encryption-key rotation provides stronger invalidation. Backups, server memory, XSS that acts through an authenticated session, compromised TLS termination, extensions and upstream provider retention remain operational threats. HttpOnly prevents direct JavaScript reads but cannot make a compromised page harmless.

The operator must keep request bodies, Authorization, Cookie/Set-Cookie and secret environment values out of reverse-proxy/APM logs and error-reporting capture. Application code adds no such collection. Existing production infrastructure was not changed or audited live. HTTPS, a supported Node runtime, existing RLS migrations and a protected secret configuration channel are deployment prerequisites.

## Capability and resource boundary

There is no agent-selected executable tool, shell, filesystem, SQL operation, project mutation, test runner or simulation invocation. A model cannot bypass the boundary by returning a function name because no tool dispatcher is installed. The system prompt reinforces this, but the absence of execution capabilities is the actual control. UI text clearly labels AI explanations/proposed actions separately from deterministic activity records. No chain-of-thought is displayed.

DeepSeek endpoints are fixed in one server adapter. Ollama uses an administrator-configured loopback HTTP origin only, and only for local development. All provider fetches reject redirects. There is no arbitrary-base-URL form, URL fetch tool, automatic model pull, provider failover or automatic billing retry.

| Limit               | Enforcement                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------- |
| Credential input    | 8–256 printable non-space ASCII characters; settings body <=2,048 bytes                  |
| Chat/context body   | <=200,000 UTF-8 bytes                                                                    |
| Conversation        | At most 20 messages; user/assistant roles only; 8,000 characters/message                 |
| Project objects     | Existing shared schema maximum 500, with domain/reference validation                     |
| Provider stream     | <=1,000,000 bytes; bounded 65,536-character line buffer                                  |
| Visible reply       | <=32,000 characters; provider request <=2,048 output tokens                              |
| Provider operations | 15-second connection/save check; 45-second chat provider budget; 60-second route maximum |
| Auth/data transport | 10-second individual fetch timeout, existing RLS and bounded projections                 |
| Ollama generation   | 2,048 predicted tokens; context budget 8,192; completion capability required             |

The provider chat budget starts when the route begins; auth/data reads have separate fetch timeouts. Hosting duration is the final overall cap. Cancellation propagates via AbortSignal and stream cancellation; it cannot recall provider work already performed or guarantee zero billing. Partial/interrupted output is never a confirmed numerical result. No distributed AI rate limiter, persistent transcript store, cost meter or account-wide spending guarantee is added. Users should use provider-side spending controls. Ollama can truncate oversized histories to its configured context budget; ask short questions.

## Evidence and remaining limits

Unit tests cover encryption isolation/tampering/expiry, secret redaction across chunk boundaries, invalid credentials, missing keys, timeout/outage/quota/rate-limit states, authentication, project filtering, input bounds, truncated streams and optional Ollama errors. Existing PostgreSQL policy tests independently verify stranger/viewer/editor/owner and revocation behavior. Browser tests cover responsive layouts, keyboard controls, mocked chat states and a real Next.js transport to an explicit local protocol fixture. These tests do not prove hosted Supabase infrastructure configuration or external model quality.

No live model request could be validated: no AI key was supplied and the default local Ollama endpoint was unavailable. Do not interpret the fixture response as real inference. Phase 2 must separately design allowed simulator actions, approval semantics and execution authorization; Phase 3 must separately design test-running capabilities and their isolation.
