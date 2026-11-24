// The lab as a folder of plain files: the lab page is the page at the root, and everything is named relative to
// it — so the folder can be put anywhere (any host of static files, any sub-path) and opened as it is, without a
// server: no rooms, no boards, no shared figures, but the whole world and every switch of the lab.
//
//   npx vite build --config lab/vite.static.config.js                      → dist/
//   npx vite build --config lab/vite.static.config.js --outDir some/folder --emptyOutDir
//
// (lab/vite.config.js builds the game and the lab pages side by side, for a server of the lab's own: lab/worker.js.)
import { defineConfig, mergeConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import game from '../vite.config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const labAtRoot = () => ({
  name: 'lab-at-root',
  transformIndexHtml: {
    order: 'pre',
    handler(html, ctx) {
      if (path.resolve(String(ctx.filename || '')) !== path.join(ROOT, 'index.html')) return html;
      return html
        .replace(/[ \t]*<script[^>]*src="https?:\/\/[^"]*"[^>]*><\/script>\n?/g, '') // (what the game's page fetches from other sites — the count of its visits — is not for the lab)
        .replace(/href="(favicon\.svg|favicon-32\.png|icon-192\.png|apple-touch-icon\.png)"/g, 'href="lab/favicon/$1"') // (the icon being tried)
        .replace('</body>', '  <script type="module" src="/lab/lab.js"></script>\n  </body>');
    },
  },
});

export default defineConfig(async (env) => mergeConfig(typeof game === 'function' ? await game(env) : game, {
  root: ROOT,
  base: './',
  define: { __LAB__: 'true' },
  plugins: [labAtRoot()],
}));
