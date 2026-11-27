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

const BUILD = buildInfo();
// The build says which version it is in a small file of its own, version.json: the server that serves these
// files reads it to tell every browser which version is online (server/release.js) — a page that is not that
// version any more then loads itself again.
const versionFile = () => ({
  name: 'version-file',
  apply: 'build',
  generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: `${JSON.stringify(BUILD)}\n` }); },
});

// What a link to the game shows where it is pasted (a chat, a social network): a title, a line, a picture —
// public/share.jpg, 1200 × 630, made with `node tools/game-shots.mjs - --nohud --size=1200x630 …`. Those who
// fetch it want the whole address of the picture: the build variable SITE_URL says where the site lives
// (https://…, no slash at the end); without it the picture is named from the root, which some of them accept.
const shareTags = () => ({
  name: 'share-tags',
  transformIndexHtml(html) {
    const site = String(process.env.SITE_URL || '').trim().replace(/\/+$/, ''), tag = (k, v, name = 'property') => `    <meta ${name}="${k}" content="${v}" />\n`;
    const title = 'Atomic Oasis', line = /<meta name="description" content="([^"]*)"/.exec(html)?.[1] || '', picture = `${site}/share.jpg`;
    const tags = tag('og:type', 'website') + tag('og:site_name', title) + tag('og:title', title) + tag('og:description', line) + (site ? tag('og:url', `${site}/`) : '')
      + tag('og:image', picture) + tag('og:image:width', '1200') + tag('og:image:height', '630') + tag('og:image:alt', 'A grand pier and its big wheel in a turquoise bay, under green mountains')
      + tag('twitter:card', 'summary_large_image', 'name') + tag('twitter:title', title, 'name') + tag('twitter:description', line, 'name') + tag('twitter:image', picture, 'name');
    return html.replace('    <link rel="icon" type="image/svg+xml"', `${tags}    <link rel="icon" type="image/svg+xml"`);
  },
});

// Relative base: the built site works from any sub-path (GitHub Pages, itch.io, a CDN folder...).
export default defineConfig({
  base: './',
  // (__LAB__, __TEST__: nobody's, in a build of the game — the lab's pages and the tools' own builds say
  // otherwise, and the game then leaves its app object on the page for them: see the top of src/main.js)
  define: { __BUILD__: JSON.stringify(BUILD), __LAB__: 'undefined', __TEST__: 'undefined' },
  plugins: [versionFile(), shareTags()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    assetsInlineLimit: 0,
  },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
});
