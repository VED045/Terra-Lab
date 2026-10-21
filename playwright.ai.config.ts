import { defineConfig } from '@playwright/test';

// Own isolated processes and a test-only protocol fixture. Never contacts a paid provider.
export default defineConfig({
  testDir: './tests/ai-e2e',
  workers: 1,
  fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:13042', headless: true, trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'node scripts/ai-provider-fixture.mjs',
      url: 'http://127.0.0.1:11444/health',
      reuseExistingServer: false,
    },
    {
      command:
        'node node_modules/next/dist/bin/next dev apps/web --webpack -H 127.0.0.1 --port 13042',
      url: 'http://127.0.0.1:13042/ai',
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        TERRALAB_AI_LOCAL_DEV: '1',
        TERRALAB_AI_OLLAMA_ENABLED: '1',
        TERRALAB_AI_OLLAMA_URL: 'http://127.0.0.1:11444',
        TERRALAB_AI_DEV_DEEPSEEK_KEY: '',
        NEXT_PUBLIC_SUPABASE_URL: '',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      },
    },
  ],
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
