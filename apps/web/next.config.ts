import type { NextConfig } from 'next';
import { execFileSync } from 'node:child_process';
let revision = process.env.VERCEL_GIT_COMMIT_SHA || 'unknown';
if (revision === 'unknown') {
  try {
    revision = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 3000,
    }).trim();
  } catch {}
}
if (!/^[a-f0-9]{40}$/.test(revision)) revision = 'unknown';
const localAI = process.env.TERRALAB_LOCAL_AI_PROFILE === '1';
const browserTest = process.env.TERRALAB_BROWSER_TEST === '1';
const config: NextConfig = {
  transpilePackages: ['@terralab/shared'],
  devIndicators: false,
  env: {
    NEXT_PUBLIC_TERRALAB_REVISION: revision,
  },
  // Independent cache/lock files let the free AI profile coexist with `npm run dev`.
  distDir: localAI ? '.next-local-ai' : browserTest ? '.next-tests' : '.next',
  ...(localAI || browserTest
    ? {
        typescript: {
          tsconfigPath: localAI ? 'tsconfig.local-ai.json' : 'tsconfig.browser-tests.json',
        },
      }
    : {}),
};
export default config;
