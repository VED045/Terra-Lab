export type ConnectionState =
  'disconnected' | 'checking' | 'connecting' | 'connected' | 'degraded' | 'error';
export function connectionFailure(code?: string) {
  const repairs: Record<string, string> = {
    ollama_disabled:
      'Open the free local runtime at http://127.0.0.1:13040/ai. The deployed server cannot inspect your laptop.',
    provider_unavailable:
      'The configured service is unreachable. Run node scripts/start-local-ai.mjs --status, then start the local profile. Do not change ports to a different instance.',
    timeout:
      'The service did not answer within its deadline. It may be starting or loading a model. Inspect the launcher logs and retry when ready.',
    unsupported_model:
      'No usable model was found. Check installed local weights and choose an available text model; downloads are manual.',
    local_model_required:
      'Only remote/cloud models were found. Install downloaded local weights for free local mode.',
    invalid_response:
      'The service returned an invalid response. Confirm this is the configured Ollama instance and inspect its logs.',
    invalid_key: 'Replace the rejected key in secure Provider settings. Never paste it into chat.',
    quota: 'Check your own DeepSeek balance or quota. No provider fallback will occur.',
  };
  return repairs[code || ''] || 'Review the error and provider setup, then retry manually.';
}
export function transientConnectionFailure(code?: string) {
  return code === 'provider_unavailable' || code === 'timeout';
}
