import { defineConfig } from '@playwright/test';
// Owned, isolated services: never reuse a developer's browser/server or cloud data.
const authFixture = process.env.TERRALAB_E2E_AUTH_FIXTURE === '1';
const webPort = 13041,
  apiPort = 18041;
export default defineConfig({
  testDir: authFixture ? './tests/auth-e2e' : './tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:' + webPort, headless: true, trace: 'retain-on-failure' },
  webServer: [
    {
      command:
        'node scripts/python.mjs -m uvicorn terralab.main:app --app-dir services/api --host 127.0.0.1 --port ' +
        apiPort,
      url: 'http://127.0.0.1:' + apiPort + '/health',
      reuseExistingServer: false,
      timeout: 30000,
      env: {
        TERRALAB_ENV: 'development',
        TERRALAB_JOB_MODE: 'local',
        TERRALAB_DATA_DIR: '.terralab/e2e-acceptance',
      },
    },
    {
      command:
        'node node_modules/next/dist/bin/next dev apps/web --webpack -H 127.0.0.1 --port ' +
        webPort,
      url: 'http://127.0.0.1:' + webPort,
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        SIMULATION_API_URL: 'http://127.0.0.1:' + apiPort,
        TERRALAB_BROWSER_TEST: '1',
        TERRALAB_AI_LOCAL_DEV: '0',
        TERRALAB_AI_OLLAMA_ENABLED: '0',
        NEXT_PUBLIC_SUPABASE_URL: authFixture ? 'https://fixture.supabase.invalid' : '',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: authFixture ? 'fixture-public' : '',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      },
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium', launchOptions: { args: ['--enable-unsafe-swiftshader'] } },
    },
  ],
});
