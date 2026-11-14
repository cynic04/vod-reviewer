import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';

const sharedAlias = { '@shared': resolve(import.meta.dirname, 'src/shared') };

/**
 * The dev server injects an inline script for React Fast Refresh, which the strict
 * Content-Security-Policy in index.html forbids. Relax it while developing only.
 */
const relaxCspForDevServer: Plugin = {
  name: 'vod-reviewer:dev-csp',
  apply: 'serve',
  transformIndexHtml: (html) => html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"),
};

export default defineConfig({
  main: {
    resolve: { alias: sharedAlias },
  },
  preload: {
    resolve: { alias: sharedAlias },
    build: {
      rolldownOptions: {
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        ...sharedAlias,
        '@renderer': resolve(import.meta.dirname, 'src/renderer/src'),
      },
    },
    plugins: [react(), relaxCspForDevServer],
  },
});
