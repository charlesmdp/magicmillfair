// The lab: pages where something new is tried inside the real game, without touching the game's own files.
//
//   npx vite --config lab/vite.config.js           then open /lab/
//   npx vite build --config lab/vite.config.js     builds the game and the lab pages together into dist/
//
// A lab page is the game's own page (index.html at the root, read as it stands at that moment) plus one script,
// lab/lab.js, that switches on the extras one chooses (src/extras) — and the icon that is being tried
// (lab/favicon). Nothing of the lab is part of an ordinary build of the game (vite.config.js at the root knows
// nothing of it).
import { defineConfig, mergeConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import game from '../vite.config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** the lab pages (lab/<name>/index.html, '' for lab/index.html itself) → the script each adds to the game */
const PAGES = { '': 'lab/lab.js', slide: 'lab/lab.js' };
const fileOf = (name) => path.join(ROOT, 'lab', name, 'index.html');

const labPages = () => ({
  name: 'lab-pages',
  transformIndexHtml: {
    order: 'pre',
    handler(html, ctx) {
      const page = /(?:^|\/)lab\/(?:([a-z0-9-]+)\/)?index\.html$/.exec(String(ctx.filename || ctx.path).replace(/\\/g, '/'));
      const script = page && PAGES[page[1] || ''];
      if (!script) return html;
      const own = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
      return own
        .replace(/(href|src)="(?!\/|https?:|data:|#)/g, '$1="/') // (what the game's page names beside itself is at the root)
        .replace(/href="\/(favicon\.svg|favicon-32\.png|icon-192\.png|apple-touch-icon\.png)"/g, 'href="/lab/favicon/$1"') // (the icon being tried)
        .replace('</body>', `  <script type="module" src="/${script}"></script>\n  </body>`);
    },
  },
});

export default defineConfig(async (env) => mergeConfig(typeof game === 'function' ? await game(env) : game, {
  root: ROOT,
  base: '/', // a lab page lives two folders down: what it loads is named from the root
  // (the lab says that it is the lab: the game may then leave what it keeps for itself in production — the
  // object the extras' switches and the tools reach, window.__mmf — where this page finds it)
  define: { __LAB__: 'true' },
  plugins: [labPages()],
  build: { rollupOptions: { input: { main: path.join(ROOT, 'index.html'), ...Object.fromEntries(Object.keys(PAGES).map((name) => [`lab${name && '-'}${name}`, fileOf(name)])) } } },
}));
