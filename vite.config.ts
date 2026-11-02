import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { buildManifest } from './scripts/manifest.mjs';

export default defineConfig(({ mode }) => {
  const target = mode === 'firefox' ? 'firefox' : 'chrome';
  const test = process.env.TN_TEST === '1'; // dist/chrome-test: extra permission for e2e only
  return {
    base: './',
    publicDir: 'public',
    define: { __TARGET__: JSON.stringify(target) },
    plugins: [
      react(),
      {
        name: 'emit-manifest',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'manifest.json',
            source: JSON.stringify(buildManifest(target, { test }), null, 2),
          });
        },
      },
    ],
    build: {
      outDir: test ? 'dist/chrome-test' : `dist/${target}`,
      emptyOutDir: true,
      target: 'es2022',
      sourcemap: false,
      rollupOptions: {
        input: { newtab: resolve('newtab.html') },
        // Stable names: reloading/updating an unpacked extension overwrites files instead of piling up hashed copies.
        output: { entryFileNames: 'assets/[name].js', chunkFileNames: 'assets/[name].js', assetFileNames: 'assets/[name][extname]' },
      },
    },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
      define: { __TARGET__: JSON.stringify('chrome') },
    },
  };
});
