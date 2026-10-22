import type { NextConfig } from 'next';
const localAI = process.env.TERRALAB_LOCAL_AI_PROFILE === '1';
const browserTest = process.env.TERRALAB_BROWSER_TEST === '1';
const config: NextConfig = {
  transpilePackages: ['@terralab/shared'],
  devIndicators: false,
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
