// The lab: pages where something new is tried inside the real game, without touching the game's own files.
//
//   npx vite --config lab/vite.config.js           then open /lab/slide/
//   npx vite build --config lab/vite.config.js     builds the game and the lab pages together into dist/
//
// A lab page is the game's own page (index.html at the root, read as it stands at that moment) plus one script
// that plugs the new thing into the running game — see lab/slide/attach.js. Nothing of the lab is part of an
// ordinary build of the game (vite.config.js at the root knows nothing of it).
import { defineConfig, mergeConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import game from '../vite.config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** name of the page (lab/<name>/index.html) → the script it adds to the game */
const PAGES = { slide: 'lab/slide/attach.js' };

const labPages = () => ({
  name: 'lab-pages',
  transformIndexHtml: {
    order: 'pre',
    handler(html, ctx) {
      const page = /lab\/([a-z0-9-]+)\/index\.html$/.exec(String(ctx.filename || ctx.path).replace(/\\/g, '/'));
      if (!page || !PAGES[page[1]]) return html;
      const own = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
      return own
        .replace(/(href|src)="(?!\/|https?:|data:|#)/g, '$1="/') // (what the game's page names beside itself is at the root)
        .replace('</body>', `  <script type="module" src="/${PAGES[page[1]]}"></script>\n  </body>`);
    },
  },
});

export default defineConfig(async (env) => mergeConfig(typeof game === 'function' ? await game(env) : game, {
  root: ROOT,
  base: '/', // a lab page lives two folders down: what it loads is named from the root
  plugins: [labPages()],
  build: { rollupOptions: { input: { main: path.join(ROOT, 'index.html'), ...Object.fromEntries(Object.keys(PAGES).map((name) => [`lab-${name}`, path.join(ROOT, 'lab', name, 'index.html')])) } } },
}));
