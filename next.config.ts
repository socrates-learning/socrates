import type { NextConfig } from 'next';

const config: NextConfig = {
  serverExternalPackages: ['socrates-media-sharp'],
  outputFileTracingIncludes: {
    '/api/content-media/uploads/*': [
      './lib/content-media/decoder-worker.cjs',
      './node_modules/socrates-media-sharp/**/*',
      './node_modules/@img/colour/**/*',
      './node_modules/detect-libc/**/*',
      './node_modules/semver/**/*',
    ],
  },
};

export default config;
