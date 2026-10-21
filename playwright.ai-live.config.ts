import { defineConfig } from '@playwright/test';
if (process.env.TERRALAB_AI_LIVE_TEST !== '1')
  throw Error(
    'Opt in with TERRALAB_AI_LIVE_TEST=1 after a local model is installed. No model is downloaded by tests.',
  );
export default defineConfig({
  testDir: './tests/ai-live',
  workers: 1,
  fullyParallel: false,
  timeout: 240000,
  use: { baseURL: 'http://127.0.0.1:13043', headless: true, trace: 'retain-on-failure' },
  webServer: [
    {
      command:
        'node scripts/python.mjs -m uvicorn terralab.main:app --app-dir services/api --host 127.0.0.1 --port 18043',
      url: 'http://127.0.0.1:18043/health',
      reuseExistingServer: false,
      env: {
        TERRALAB_ENV: 'development',
        TERRALAB_JOB_MODE: 'local',
        TERRALAB_DATA_DIR: '.terralab/ai-live',
      },
    },
    {
      command:
        'node node_modules/next/dist/bin/next dev apps/web --webpack -H 127.0.0.1 --port 13043',
      url: 'http://127.0.0.1:13043/ai',
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        TERRALAB_AI_LOCAL_DEV: '1',
        TERRALAB_AI_TESTING_ENABLED: '1',
        TERRALAB_AI_OLLAMA_ENABLED: '1',
        TERRALAB_AI_FREE_LOCAL_ONLY: '1',
        TERRALAB_AI_OLLAMA_URL: process.env.TERRALAB_AI_LIVE_OLLAMA_URL || 'http://127.0.0.1:11435',
        TERRALAB_AI_OLLAMA_MODEL: process.env.TERRALAB_AI_LIVE_MODEL || 'deepseek-r1:8b',
        TERRALAB_AI_DEV_DEEPSEEK_KEY: '',
        SIMULATION_API_URL: 'http://127.0.0.1:18043',
        NEXT_PUBLIC_SUPABASE_URL: '',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
        SUPABASE_SECRET_KEY: '',
        SUPABASE_SERVICE_ROLE_KEY: '',
      },
    },
  ],
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
