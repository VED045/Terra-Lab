import { describe, expect, it } from 'vitest';
import { connectionFailure, transientConnectionFailure } from './connection-state';
describe('connection diagnosis', () => {
  it('distinguishes disabled local transport, wrong instance, missing weights and timeout', () => {
    expect(connectionFailure('ollama_disabled')).toContain('13040');
    expect(connectionFailure('provider_unavailable')).toContain('different instance');
    expect(connectionFailure('unsupported_model')).toContain('manual');
    expect(connectionFailure('timeout')).toContain('loading');
    expect(connectionFailure('invalid_response')).toContain('invalid response');
  });
  it('only retries transient reachability failures', () => {
    expect(transientConnectionFailure('provider_unavailable')).toBe(true);
    expect(transientConnectionFailure('timeout')).toBe(true);
    for (const code of [
      'invalid_key',
      'ollama_disabled',
      'unsupported_model',
      'invalid_response',
      'quota',
    ])
      expect(transientConnectionFailure(code)).toBe(false);
  });
});
