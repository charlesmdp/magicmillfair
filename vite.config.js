import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

// Which version a build is: its commit (from the build variables of the host, else from git) and when it was
// made. Shown on the welcome screen and in the settings, so that one can tell what is online.
function buildInfo() {
  let commit = process.env.WORKERS_CI_COMMIT_SHA || process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || '';
  if (!commit) {
    try { commit = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* not a git checkout */ }
  }
  return { commit: commit.slice(0, 7), date: new Date().toISOString().slice(0, 16).replace('T', ' ') };
}

// Relative base: the built site works from any sub-path (GitHub Pages, itch.io, a CDN folder...).
export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(buildInfo()) },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    assetsInlineLimit: 0,
  },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
});
