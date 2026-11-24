// The lab as a folder of plain files, ready to be put on any host of static files — to let its owner try what is
// being made without a server of the lab's own. It builds the lab page (lab/vite.static.config.js), takes out
// what such a folder has no use for (the back office, the pages of figures, the maps of the other track, the
// headers of a host that is not this one), and says what it weighs.
//
//   node lab/tools/static-site.mjs <folder> [--page=play.html]
//
// <folder> is emptied first. `--page`: the name the lab page is given in it (index.html unless said) — a host
// that keeps index.html for a page of its own is given another. Prints one line per kind of file and the total;
// writes <folder>/files.json: every file of the folder, with its size and its media type.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2), out = path.resolve(args.find((a) => !a.startsWith('--')) || ''), page = (args.find((a) => a.startsWith('--page=')) || '--page=index.html').slice(7);
if (!args.find((a) => !a.startsWith('--'))) { console.log('usage: node lab/tools/static-site.mjs <folder> [--page=play.html]'); process.exit(1); }
if (out === ROOT || ROOT.startsWith(out + path.sep)) { console.log('not there: that folder holds the repository'); process.exit(1); }

const built = spawnSync('npx', ['vite', 'build', '--config', 'lab/vite.static.config.js', '--outDir', out, '--emptyOutDir', '--logLevel', 'warn'], { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
if (built.status !== 0) process.exit(built.status || 1);

// what a folder of plain files has no use for
for (const gone of ['admin', 'opendata', 'opendate', '_headers', 'version.json', 'assets/world-classic']) fs.rmSync(path.join(out, gone), { recursive: true, force: true });
if (page !== 'index.html') fs.renameSync(path.join(out, 'index.html'), path.join(out, page));

const TYPES = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', glb: 'model/gltf-binary', bin: 'application/octet-stream' };
const files = [];
const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) walk(f); else files.push({ path: path.relative(out, f).split(path.sep).join('/'), bytes: fs.statSync(f).size, type: TYPES[e.name.split('.').pop()] || 'application/octet-stream' }); } };
walk(out);
files.sort((a, b) => a.path.localeCompare(b.path));
const kinds = {};
for (const f of files) { const k = f.path.split('.').pop(); (kinds[k] ||= { n: 0, bytes: 0 }); kinds[k].n++; kinds[k].bytes += f.bytes; }
const mb = (b) => `${(b / 1048576).toFixed(2)} MB`;
for (const [k, v] of Object.entries(kinds).sort((a, b) => b[1].bytes - a[1].bytes)) console.log(`${k.padEnd(5)} ${String(v.n).padStart(4)} files  ${mb(v.bytes).padStart(9)}`);
const total = files.reduce((s, f) => s + f.bytes, 0), big = files.reduce((a, f) => (f.bytes > a.bytes ? f : a), files[0]);
console.log(`total ${String(files.length).padStart(4)} files  ${mb(total).padStart(9)}   (the largest: ${big.path}, ${mb(big.bytes)})`);
fs.writeFileSync(path.join(out, 'files.json'), `${JSON.stringify(files, null, 1)}\n`);
console.log(`the page: ${path.join(out, page)}`);
