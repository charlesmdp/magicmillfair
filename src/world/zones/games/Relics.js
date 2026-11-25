// Twenty-five things left over from before. The oasis is all that is left of the planet, and here and there
// something says so: a road sign that sends the evacuation into the sea, a vending machine under the ivy, a
// scarecrow in a hazmat suit, a bus stop where the next bus is always four minutes away… — and, where nobody
// goes, a fallout shelter whose periscope turns to look at who found it. Twenty stand by the paths and in the
// woods; five are where one has to go and look: at the top of the tower of those who watch the climb, in a
// hollow half-way up the island of the boulder, on the sand of the secret cove, on the beach at the foot of the
// stairs to the golden statues, in the grotto behind the waterfall. Each is looked at (the prompt of the
// game says "Look at…") and has a line or two to say. Who has looked at them all is told so — and may, from
// then on, raise a small mushroom cloud over their head (the game: the emotes).
//
// They cost little: their wood, metal and stone are in the materials of the fair (merged with the rest of the
// zone), and everything that is written or drawn on them is on ONE picture, on one mesh — two draw calls for all
// of them (and one more for the head of the periscope, which turns). Where each stands: RELICS in layout.js (a wish: the nearest free ground is taken — dry, level,
// off the paths, clear of the trees and of what is built).
import * as THREE from 'three';
import { Parts } from '../../props/MeshBuilder.js';
import { RELICS, SIGNPOSTS, GAME_SIGNPOSTS } from '../../layout/layout.js';

const SERIF = "Georgia, 'Times New Roman', serif", SANS = 'system-ui, sans-serif';

// What each says when it is looked at (`label`: what the prompt calls it), and the ground it needs (`r`, metres).
export const RELIC_WORDS = {
  sign: { r: 0.9, label: 'the old road sign', text: 'EVACUATION ROUTE, and an arrow. It points straight into the sea. Whoever planned the evacuation was an optimist — or a very good swimmer.' },
  vendor: { r: 0.8, label: 'the vending machine', text: 'It still hums. It has hummed for longer than anybody here has been alive. Everything in it is sold out, and it wants exact change.' },
  hatch: { r: 1.3, label: 'the shelter door', text: 'A shelter, locked from the inside. The note on the door says "Back in 5 minutes". The paint of the note is older than the trees.' },
  barrel: { r: 0.5, label: 'the yellow barrel', text: 'The plate on it says not to come near, not to touch, not to breathe. Somebody has planted flowers in it. They are doing suspiciously well.' },
  geiger: { r: 0.4, label: 'the little box on its post', text: 'A Geiger counter. It ticks — politely, the way one clears one\'s throat. It has ticked like that for years: here, that is what silence sounds like.' },
  billboard: { r: 2.0, label: 'the billboard', text: '"THE FUTURE IS BRIGHT". Something very bright indeed burnt a hole right through it. Nobody could bring themselves to take it down.' },
  clock: { r: 0.5, label: 'the clock', text: 'It stopped at seventeen minutes past four, on the last afternoon. It could be mended. Everybody agreed it should not: it is right twice a day, which is better than most.' },
  tally: { r: 1.0, label: 'the scratched stone', text: 'Somebody counted the days here, five by five. The marks go on and on — and then they stop, and under them: "…then we stopped counting, and built a fair."' },
  sunflower: { r: 0.4, label: 'the sunflower', text: 'It has two heads. Both look at the sun, and they do not always agree where it is. Otherwise a perfectly ordinary sunflower, it would like you to know.' },
  news: { r: 0.5, label: 'the newspaper box', text: 'The last newspaper ever printed is still in it. The headline: "EVERYTHING FINE, SAY EXPERTS". It costs a coin nobody mints any more.' },
  scarecrow: { r: 0.6, label: 'the scarecrow', text: 'A scarecrow in a hazmat suit. The crows keep their distance. So does everybody else. The wheat has never done better.' },
  busstop: { r: 1.2, label: 'the bus stop', text: 'The timetable says the next bus is in 4 minutes. It has said so for longer than anybody can remember. Somebody still dusts the bench.' },
  trolley: { r: 0.7, label: 'the shopping trolley', text: 'A shopping trolley, by the water. There is no shop within a thousand kilometres. Trolleys always find water: it is what they do.' },
  dish: { r: 0.9, label: 'the dish', text: 'It still listens to the sky, night and day. The sky has had nothing to say for a long time. The little screen says NO SIGNAL — which is, in its way, a signal.' },
  meter: { r: 0.35, label: 'the parking meter', text: 'EXPIRED. Somebody owes it a few decades of parking. There is no car, no road, no street — it stands its ground, and waits to be paid.' },
  mailbox: { r: 0.4, label: 'the mailbox', text: 'The flag is up: there is mail. There is always mail — nobody knows who brings it. All bills, addressed to "The Occupant, What Is Left Of The World".' },
  car: { r: 1.9, label: 'the car', text: 'A car, with a tree through its roof. The tree is forty years old. It had right of way.' },
  phone: { r: 0.55, label: 'the telephone', text: 'A public telephone. Now and then it rings. Nobody dares to pick up: whoever is calling has been very patient, and may want something.' },
  forecast: { r: 0.8, label: 'the weather board', text: '"TODAY: radiation mild, with sunny spells. TOMORROW: same." Somebody chalks it up again every morning. It has never once been wrong.' },
  // (the five one has to go and find)
  telescope: { r: 0.4, label: 'the coin telescope', text: 'A coin telescope — the kind that showed you a car park for a coin. This one asks for nothing: it is jammed for good, pointing at where the rest of the world used to be. Clear day. Nothing to report.' },
  gnome: { r: 0.3, label: 'the garden gnome', text: 'A garden gnome in a gas mask, tucked into the rock where the boulder cannot get him. He has watched it roll past more times than he can count. He is not coming out.' },
  bottle: { r: 0.35, label: 'the bottle', text: 'A message in a bottle, washed up where nobody comes. It says: "If you find this, send help." On the back, in another hand: "We are the help. Sorry."' },
  postcards: { r: 0.45, label: 'the postcard rack', text: 'A rack of postcards, bleached white by forty summers. Every one of them says WISH YOU WERE HERE. It has stopped being a wish: there is nowhere else left to be.' },
  tins: { r: 0.9, label: 'the stack of tins', text: 'Tins, stacked higher than you by somebody who meant to outlast everything. Hundreds of them. All peaches. There is no tin opener — there never was one: that is the sad part.' },
  bunker: { r: 1.7, label: 'the mound', text: 'A fallout shelter, sealed from the inside — and so well hidden that you may be the first to find it. The periscope turns to look at you. Somebody is still down there, waiting for it all to be over. Nobody has had the heart to tell them.' },
};

// Where each picture is on the sheet: [x, y, w, h] in pixels (the sheet is 1024 × 1024).
const SHEET = 1024;
const CELL = {
  billboard: [0, 0, 768, 384], vendor: [772, 0, 250, 480], sign: [0, 388, 640, 220], geiger: [644, 388, 76, 66], tally: [0, 612, 384, 256],
  billback: [388, 612, 384, 192], news: [776, 484, 240, 340], clock: [0, 872, 150, 150], trefoil: [154, 872, 150, 150], hatch: [388, 808, 212, 212],
  forecast: [772, 828, 250, 194], bus: [604, 808, 168, 214], nosignal: [720, 388, 48, 60], expired: [720, 452, 48, 60],
};
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// The hole burnt through the billboard, in the picture of its front (the back is its mirror): around (HOLE.x, HOLE.y) of the board.
const HOLE = { x: 0.71, y: 0.73, r: 0.2 };

function paint(ctx) {
  const cell = (k, draw) => { const [x, y, w, h] = CELL[k]; ctx.save(); ctx.translate(x, y); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip(); draw(w, h); ctx.restore(); };
  const rnd = (seed, i) => Math.abs(Math.sin(seed + i * 12.9898) * 43758.5453) % 1;
  const rust = (w, h, n, seed) => { for (let i = 0; i < n; i++) { const r = rnd(seed, i), q = rnd(seed * 1.7, i); ctx.fillStyle = `rgba(${90 + r * 60}, ${45 + q * 25}, 20, ${0.16 + r * 0.28})`; ctx.beginPath(); ctx.ellipse(r * w, q * h, 6 + q * 26, 4 + r * 12, r * 3, 0, 7); ctx.fill(); } };
  const words = (text, x, y, size, color, font = SANS, weight = 800, max) => { ctx.font = `${weight} ${size}px ${font}`; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y, max); };
  // (the outline of the hole, `k` times its size)
  const hole = (w, h, k) => { ctx.beginPath(); for (let i = 0; i <= 48; i++) { const a = (i / 48) * Math.PI * 2, r = h * HOLE.r * k * (1 + 0.16 * Math.sin(a * 5 + 1.3) + 0.08 * Math.sin(a * 11)); ctx.lineTo(w * HOLE.x + Math.cos(a) * r * 1.25, h * HOLE.y + Math.sin(a) * r); } ctx.closePath(); };
  const burnt = (w, h) => {
    ctx.fillStyle = 'rgba(70, 34, 12, 0.5)'; hole(w, h, 1.32); ctx.fill();
    ctx.fillStyle = '#2a1508'; hole(w, h, 1.14); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000'; hole(w, h, 1); ctx.fill(); ctx.restore(); // (right through: one sees the sky)
  };
  cell('billboard', (w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#f6c95a'); g.addColorStop(1, '#f08a4a'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff4c8'; ctx.beginPath(); ctx.arc(w * 0.3, h * 1.08, h * 0.6, Math.PI, 0); ctx.fill();
    words('THE FUTURE', w * 0.5, h * 0.17, 72, '#3a1e55', SERIF, 700, w * 0.92); words('IS BRIGHT', w * 0.5, h * 0.4, 72, '#3a1e55', SERIF, 700, w * 0.92);
    rust(w, h, 18, 7.7);
    burnt(w, h);
  });
  cell('billback', (w, h) => {
    ctx.fillStyle = '#6d5f50'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) { ctx.fillStyle = `rgba(${40 + rnd(4.2, i) * 50}, ${32 + rnd(4.2, i) * 40}, 24, 0.35)`; ctx.fillRect((i * w) / 8, 0, w / 8 - 2, h); }
    ctx.fillStyle = '#4a3f33'; ctx.fillRect(0, h * 0.2, w, 10); ctx.fillRect(0, h * 0.78, w, 10);
    ctx.save(); ctx.translate(w, 0); ctx.scale(-1, 1); burnt(w, h); ctx.restore();
  });
  cell('sign', (w, h) => {
    ctx.fillStyle = '#1f7a3a'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#f4f1e4'; ctx.lineWidth = 10; ctx.strokeRect(12, 12, w - 24, h - 24);
    words('EVACUATION ROUTE', w * 0.5, h * 0.34, 54, '#f4f1e4', SANS, 800, w * 0.86);
    ctx.strokeStyle = '#f4f1e4'; ctx.lineWidth = 18; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(w * 0.2, h * 0.7); ctx.lineTo(w * 0.78, h * 0.7); ctx.moveTo(w * 0.69, h * 0.55); ctx.lineTo(w * 0.8, h * 0.7); ctx.lineTo(w * 0.69, h * 0.85); ctx.stroke();
    rust(w, h, 26, 3.1);
  });
  cell('vendor', (w, h) => {
    ctx.fillStyle = '#24414d'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#0d1a20'; ctx.fillRect(18, 22, w - 36, h * 0.52);
    for (let r = 0; r < 4; r++) { ctx.fillStyle = '#6f7f86'; ctx.fillRect(22, 78 + r * h * 0.125, w - 44, 4); for (let c = 0; c < 4; c++) { ctx.fillStyle = '#c9a13c'; ctx.fillRect(30 + c * 52, 60 + r * h * 0.125, 36, 12); words('SOLD OUT', 48 + c * 52, 67 + r * h * 0.125, 7, '#1b1206', SANS, 800); } }
    ctx.fillStyle = '#c9a13c'; ctx.fillRect(18, h * 0.6, w - 36, 58); words('OUT OF EVERYTHING', w / 2, h * 0.6 + 20, 19, '#1b1206', SANS, 800, w - 50); words('EXACT CHANGE ONLY', w / 2, h * 0.6 + 43, 13, '#1b1206', SANS, 700, w - 50);
    ctx.fillStyle = '#0d1a20'; ctx.fillRect(w * 0.22, h * 0.8, w * 0.56, h * 0.12);
    ctx.fillStyle = '#7dff9a'; ctx.beginPath(); ctx.arc(w - 34, h * 0.76, 5, 0, 7); ctx.fill();
    rust(w, h, 30, 5.3);
  });
  cell('tally', (w, h) => {
    // (scratched in the stone: nothing but the marks is painted — the rest of the picture is not there)
    ctx.strokeStyle = '#f1eee2'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (let row = 0; row < 4; row++) for (let g = 0; g < 9; g++) { if (row === 3 && g > 4) break; const x0 = 24 + g * 38, y0 = 16 + row * 40; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x0 + i * 6 + (i % 2), y0); ctx.lineTo(x0 + i * 6, y0 + 28); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(x0 - 5, y0 + 22); ctx.lineTo(x0 + 24, y0 + 6); ctx.stroke(); }
    words('…then we stopped counting,', w / 2, h * 0.74, 25, '#f1eee2', SERIF, 700, w - 24); words('and built a fair.', w / 2, h * 0.88, 25, '#f1eee2', SERIF, 700, w - 24);
  });
  cell('news', (w, h) => {
    ctx.fillStyle = '#b3261e'; ctx.fillRect(0, 0, w, h);
    words('DAILY NEWS', w / 2, 26, 22, '#fff', SERIF, 700, w - 30);
    ctx.fillStyle = '#e8e2cf'; ctx.fillRect(22, 50, w - 44, h * 0.6);
    words('EVERYTHING', w / 2, 84, 27, '#141414', SERIF, 700, w - 60); words('FINE,', w / 2, 116, 27, '#141414', SERIF, 700, w - 60); words('SAY EXPERTS', w / 2, 148, 27, '#141414', SERIF, 700, w - 60);
    ctx.fillStyle = '#8d8672'; for (let i = 0; i < 6; i++) ctx.fillRect(34, 172 + i * 12, w - 68 - (i % 3) * 22, 4);
    ctx.fillStyle = '#1b1b1b'; ctx.fillRect(w / 2 - 34, h * 0.82, 68, 14); words('ONE COIN', w / 2, h * 0.93, 12, '#fff', SANS, 700);
    rust(w, h, 16, 9.9);
  });
  cell('hatch', (w, h) => {
    // a round steel door in a frame of warning stripes, and the note taped on it
    ctx.fillStyle = '#c9a13c'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#141414'; for (let i = -4; i < 10; i++) { ctx.beginPath(); ctx.moveTo(i * 40, 0); ctx.lineTo(i * 40 + 20, 0); ctx.lineTo(i * 40 + 20 - 56, h); ctx.lineTo(i * 40 - 56, h); ctx.fill(); }
    ctx.fillStyle = '#4b5258'; ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.44, 0, 7); ctx.fill();
    ctx.fillStyle = '#5d666d'; ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.39, 0, 7); ctx.fill();
    ctx.fillStyle = '#2c3135'; for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ctx.beginPath(); ctx.arc(w / 2 + Math.cos(a) * w * 0.415, h / 2 + Math.sin(a) * w * 0.415, 3, 0, 7); ctx.fill(); }
    ctx.strokeStyle = '#22262a'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(w * 0.36, h * 0.4, w * 0.13, 0, 7); ctx.stroke();
    ctx.lineWidth = 5; for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI + 0.4; ctx.beginPath(); ctx.moveTo(w * 0.36 - Math.cos(a) * w * 0.13, h * 0.4 - Math.sin(a) * w * 0.13); ctx.lineTo(w * 0.36 + Math.cos(a) * w * 0.13, h * 0.4 + Math.sin(a) * w * 0.13); ctx.stroke(); }
    rust(w, h, 12, 2.2);
    ctx.save(); ctx.translate(w * 0.56, h * 0.64); ctx.rotate(-0.1); ctx.fillStyle = '#f1ead2'; ctx.fillRect(-70, -34, 140, 68); words('BACK IN', 0, -13, 23, '#2b2118', SERIF, 700); words('5 MINUTES', 0, 14, 23, '#2b2118', SERIF, 700); ctx.restore();
  });
  cell('clock', (w, h) => {
    ctx.fillStyle = '#2d2a26'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#f1ead2'; ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.45, 0, 7); ctx.fill();
    ctx.strokeStyle = '#2d2a26'; ctx.lineWidth = 3; for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(w / 2 + Math.sin(a) * w * 0.36, h / 2 - Math.cos(a) * w * 0.36); ctx.lineTo(w / 2 + Math.sin(a) * w * 0.41, h / 2 - Math.cos(a) * w * 0.41); ctx.stroke(); }
    // (seventeen minutes past four)
    const hand = (a, len, wide) => { ctx.lineWidth = wide; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(w / 2, h / 2); ctx.lineTo(w / 2 + Math.sin(a) * len, h / 2 - Math.cos(a) * len); ctx.stroke(); };
    hand(((4 + 17 / 60) / 12) * Math.PI * 2, w * 0.24, 6); hand((17 / 60) * Math.PI * 2, w * 0.36, 4);
  });
  cell('trefoil', (w, h) => {
    ctx.fillStyle = '#e8c31e'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#141414'; ctx.lineWidth = 6; ctx.strokeRect(5, 5, w - 10, h - 10); ctx.fillStyle = '#141414';
    ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.075, 0, 7); ctx.fill();
    for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + (i * Math.PI * 2) / 3; ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.36, a - 0.52, a + 0.52); ctx.arc(w / 2, h / 2, w * 0.13, a + 0.52, a - 0.52, true); ctx.fill(); }
  });
  cell('forecast', (w, h) => {
    // a blackboard, chalked up again every morning
    ctx.fillStyle = '#1d2a25'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, w - 10, h - 10);
    words('TODAY', w * 0.36, 36, 24, '#f4f1e4', SERIF, 700); words('radiation: mild,', w / 2, 76, 21, '#e8e4d2', SERIF, 400, w - 30); words('with sunny spells', w / 2, 104, 21, '#e8e4d2', SERIF, 400, w - 30);
    words('TOMORROW: same', w / 2, 152, 19, '#c9c4ae', SERIF, 700, w - 30);
    ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(w * 0.78, 36, 12, 0, 7); ctx.stroke(); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(w * 0.78 + Math.cos(a) * 16, 36 + Math.sin(a) * 16); ctx.lineTo(w * 0.78 + Math.cos(a) * 22, 36 + Math.sin(a) * 22); ctx.stroke(); }
  });
  cell('bus', (w, h) => {
    ctx.fillStyle = '#f1ede0'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#1f4f9a'; ctx.fillRect(0, 0, w, 44); words('BUS STOP', w / 2, 23, 21, '#fff', SANS, 800, w - 16);
    words('NEXT BUS', w / 2, 70, 15, '#333', SANS, 700); words('4 min', w / 2, 106, 40, '#b3261e', SANS, 800);
    ctx.fillStyle = '#8d8672'; for (let i = 0; i < 6; i++) { ctx.fillRect(14, 140 + i * 11, 44, 3); ctx.fillRect(70, 140 + i * 11, w - 84 - (i % 3) * 14, 3); }
    rust(w, h, 8, 6.1);
  });
  cell('nosignal', (w, h) => { ctx.fillStyle = '#05080a'; ctx.fillRect(0, 0, w, h); words('NO', w / 2, h * 0.36, 13, '#7dff9a', SANS, 800); words('SIGNAL', w / 2, h * 0.62, 11, '#7dff9a', SANS, 800, w - 4); });
  cell('expired', (w, h) => { ctx.fillStyle = '#b3261e'; ctx.fillRect(0, 0, w, h); words('EXPIRED', w / 2, h / 2, 10, '#fff', SANS, 800, w - 4); });
  cell('geiger', (w, h) => {
    ctx.fillStyle = '#d9d2bd'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#2d2a26'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(w / 2, h * 0.86, w * 0.4, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    ctx.strokeStyle = '#b3261e'; ctx.beginPath(); ctx.moveTo(w / 2, h * 0.86); ctx.lineTo(w * 0.36, h * 0.36); ctx.stroke();
  });
}

/** The nearest free ground to a wish: dry, level, off the paths and the fields, clear of the trees and of what is built. */
function settle(zone, taken, wish, need) {
  const data = zone.data, g = zone.ground, layers = new Float32Array(8), R = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [Math.cos((i * Math.PI) / 4) * need, Math.sin((i * Math.PI) / 4) * need]);
  const free = (px, pz) => {
    const h = g(px, pz);
    if (!data.inside(px, pz, 6) || h < data.waterAt(px, pz) + 0.3) return false;
    for (const [dx, dz] of R) { const q = g(px + dx, pz + dz); if (Math.abs(q - h) > 0.18 + need * 0.22 || q < data.waterAt(px + dx, pz + dz) + 0.15) return false; }
    data.surfaceAt(px, pz, layers);
    if (!wish.field && layers[7] > 0.4) return false; // (a field — unless it belongs in one: the scarecrow)
    for (const [ax, az, bx, bz, half] of taken.paths) { // (a path, a lane, the track of the race)
      const ux = bx - ax, uz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * ux + (pz - az) * uz) / (ux * ux + uz * uz || 1)));
      if ((ax + ux * t - px) ** 2 + (az + uz * t - pz) ** 2 < (half + need * 0.5 + 0.4) ** 2) return false;
    }
    for (const [tx, tz, tr] of taken.trees) if ((tx - px) ** 2 + (tz - pz) ** 2 < (tr + need + 0.7) ** 2) return false;
    for (const c of taken.built) if ((c.x - px) ** 2 + (c.z - pz) ** 2 < ((c.type === 'box' ? Math.hypot(c.hw, c.hl) : c.r) + need + 0.9) ** 2) return false;
    return true;
  };
  for (let r = 0; r <= 10; r += 0.5) for (let k = 0, n = r ? 16 : 1; k < n; k++) { const a = (k / n) * Math.PI * 2 + r * 0.7, px = wish.x + Math.cos(a) * r, pz = wish.z + Math.sin(a) * r; if (free(px, pz)) return [px, pz, true]; }
  return [wish.x, wish.z, false];
}

/** The way to the nearest sea from (x, z): a unit vector, or null when there is none within reach. */
function seaward(data, x, z) {
  for (let d = 6; d <= 120; d += 6) for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, wl = data.waterAt(px, pz); if (wl > -500 && Math.abs(wl) < 0.6 && wl - data.heightAt(px, pz) > 1.2) return [Math.cos(a), Math.sin(a)]; }
  return null;
}

/**
 * Builds the relics into `zone` (GamesZone). Returns { list: [{ id, x, y, z, yaw, r, settled, under, label, text }],
 * mesh (the one that carries the pictures), near(x, z) → the relic one stands by, or null }.
 */
export function buildRelics(zone) {
  const parts = new Parts(), metal = parts.get('paint'), wood = parts.get('woodDark'), stone = parts.get('stone');
  const world = zone.world, built = [...(world.mill?.colliders || []), ...(world.pier?.colliders || []), ...(world.places?.colliders || []), ...zone.colliders].filter((c) => c && Number.isFinite(c.x) && Number.isFinite(c.z));
  for (const p of [...SIGNPOSTS, ...GAME_SIGNPOSTS]) built.push({ type: 'circle', x: p.x, z: p.z, r: 1.2 });
  const taken = { built, trees: (() => { try { return world.forest.colliders(); } catch { return []; } })(), paths: [] };
  for (const p of zone.data.meta.paths || []) for (let i = 1; i < p.samples.length; i++) taken.paths.push([p.samples[i - 1][0], p.samples[i - 1][1], p.samples[i][0], p.samples[i][1], ((p.width || 2) + 0.8) / 2]);
  const pos = [], uv = [], idx = [], list = [];
  let scope = null; // (where the head of the periscope is)
  for (const wish of RELICS) {
    const say = RELIC_WORDS[wish.id];
    if (!say) continue;
    // (`by`: on the verge of a path — so far along it, so many metres to its side — looking at the path)
    let wx = wish.x, wz = wish.z, look = wish.face;
    if (wish.by) {
      const [id, along, aside] = wish.by, path = (zone.data.meta.paths || []).find((q) => q.id === id);
      if (path) {
        const n = path.samples.length, i = Math.max(0, Math.min(n - 2, Math.round(along * (n - 1)))), a = path.samples[i], b = path.samples[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], dl = Math.hypot(dx, dz) || 1;
        wx = a[0] - (dz / dl) * aside; wz = a[1] + (dx / dl) * aside; look = [a[0], a[1]];
      }
    }
    if (!Number.isFinite(wx) || !Number.isFinite(wz)) continue;
    // (`y`: it stands on something built, or under the rock — the deck of a tower, the floor of a cave —, not on the ground of the map)
    const [x, z, settled] = wish.fixed ? [wx, wz, true] : settle(zone, taken, { x: wx, z: wz, field: wish.field }, say.r), y = wish.y ?? zone.ground(x, z);
    // which way it faces: a point it looks at — or, for the road sign, so that its right hand points at the sea
    const sea = wish.sea ? seaward(zone.data, x, z) : null;
    const yaw = sea ? Math.atan2(-sea[1], sea[0]) : look ? Math.atan2(look[0] - x, look[1] - z) : 0;
    const c = Math.cos(yaw), s = Math.sin(yaw), at = (lx, ly, lz) => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
    // (a picture of the sheet on a rectangle that faces the way the relic does: its middle, its size, how far forward;
    // `lean`: turned in its own plane; `back`: it faces the other way)
    const face = (k, cx, cy, w, h, lz, lean = 0, back = false) => {
      const [u0, v0, cw, ch] = CELL[k], base = pos.length / 3, f = back ? -1 : 1;
      for (const [dx, dy] of [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]) pos.push(...at(cx + f * (dx * Math.cos(lean) - dy * Math.sin(lean)), cy + dx * Math.sin(lean) + dy * Math.cos(lean), lz));
      uv.push(u0 / SHEET, 1 - (v0 + ch) / SHEET, (u0 + cw) / SHEET, 1 - (v0 + ch) / SHEET, (u0 + cw) / SHEET, 1 - v0 / SHEET, u0 / SHEET, 1 - v0 / SHEET);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    for (const b of [metal, wood, stone]) b.place(x, y, z, yaw);
    if (wish.id === 'sign') {
      // a road sign that has leant for years
      const lean = 0.1;
      metal.place(0, 0, 0, 0, 0, lean);
      metal.tint(0.42, 0.44, 0.46, 1).cylinder(0, -0.4, 0, 0.05, 0.05, 2.55, 6);
      metal.tint(0.3, 0.32, 0.33, 1).box(-0.84, 1.46, -0.035, 0.84, 2.08, 0.0);
      metal.pop();
      face('sign', -1.77 * Math.sin(lean), 1.77 * Math.cos(lean), 1.62, 0.56, 0.012, lean);
    } else if (wish.id === 'vendor') {
      metal.tint(0.14, 0.26, 0.3, 1).box(-0.45, -0.2, -0.38, 0.45, 1.8, 0.36);
      face('vendor', 0, 0.91, 0.88, 1.74, 0.372);
      // (the ivy has had it for years)
      for (const [lx, ly, lz, w] of [[-0.3, 1.82, 0, 0.5], [0.22, 1.86, -0.1, 0.42], [-0.47, 1.3, 0.12, 0.2], [0.47, 0.9, -0.05, 0.24], [0.44, 1.5, 0.3, 0.2], [-0.46, 0.5, 0.3, 0.26], [-0.4, 1.7, 0.34, 0.22], [0.1, 1.84, 0.3, 0.3]]) metal.tint(0.14 + 0.1 * Math.abs(lx), 0.42 + 0.1 * Math.abs(lz), 0.12, 1).box(lx - w / 2, ly - 0.07, lz - w / 2, lx + w / 2, ly + 0.09, lz + w / 2);
    } else if (wish.id === 'hatch') {
      // the way into a shelter: a block of concrete out of the ground, its steel door, the pipe that lets it breathe
      stone.tint(0.82, 0.82, 0.8, 1).box(-0.95, -0.5, -0.75, 0.95, 1.5, 0.55).box(-1.06, 1.5, -0.86, 1.06, 1.64, 0.66);
      metal.tint(0.25, 0.27, 0.29, 1).cylinder(0.62, 1.64, -0.36, 0.08, 0.08, 0.5, 8).cylinder(0.62, 2.14, -0.36, 0.15, 0.15, 0.07, 8);
      face('hatch', 0, 0.8, 1.3, 1.3, 0.562);
    } else if (wish.id === 'barrel') {
      metal.tint(0.9, 0.74, 0.1, 1).cylinder(0, -0.1, 0, 0.33, 0.33, 1.0, 12);
      metal.tint(0.3, 0.28, 0.22, 1).cylinder(0, 0.28, 0, 0.345, 0.345, 0.05, 12).cylinder(0, 0.62, 0, 0.345, 0.345, 0.05, 12);
      metal.tint(0.25, 0.16, 0.08, 1).cylinder(0, 0.86, 0, 0.3, 0.3, 0.05, 12); // (earth)
      metal.tint(0.2, 0.2, 0.2, 1).box(-0.2, 0.3, 0.26, 0.2, 0.7, 0.35); // (the plate that warns)
      face('trefoil', 0, 0.5, 0.36, 0.36, 0.356);
      // (the flowers: doing suspiciously well)
      for (let i = 0; i < 7; i++) { const a = i * 2.4, d = 0.07 + (i % 3) * 0.08, fx = Math.cos(a) * d, fz = Math.sin(a) * d, h = 0.34 + (i % 4) * 0.09; metal.tint(0.2, 0.55, 0.16, 1).cylinder(fx, 0.9, fz, 0.012, 0.01, h, 4); metal.tint(...[[1, 0.3, 0.5], [1, 0.85, 0.15], [0.55, 0.4, 1], [1, 0.5, 0.1]][i % 4], 1).cylinder(fx, 0.9 + h, fz, 0.02, 0.075, 0.07, 6); }
    } else if (wish.id === 'geiger') {
      wood.tint(0.8, 0.75, 0.7, 1).cylinder(0, -0.3, 0, 0.06, 0.05, 1.75, 6);
      metal.tint(0.75, 0.72, 0.62, 1).box(-0.13, 1.1, 0.03, 0.13, 1.44, 0.15);
      metal.tint(0.15, 0.15, 0.16, 1).cylinder(0.16, 1.2, 0.09, 0.02, 0.02, 0.22, 5);
      face('geiger', 0, 1.3, 0.2, 0.17, 0.153);
    } else if (wish.id === 'billboard') {
      // two posts, two rails — and the board between them is the picture itself, burnt right through
      for (const lx of [-1.45, 1.45]) wood.tint(0.7, 0.65, 0.6, 1).cylinder(lx, -0.5, -0.12, 0.09, 0.08, 4.3, 6);
      wood.tint(0.55, 0.5, 0.46, 1).box(-1.75, 1.88, -0.06, 1.75, 1.96, 0.02).box(-1.75, 3.64, -0.06, 1.75, 3.72, 0.02);
      face('billboard', 0, 2.8, 3.4, 1.7, 0);
      face('billback', 0, 2.8, 3.4, 1.7, -0.035, 0, true);
    } else if (wish.id === 'clock') {
      metal.tint(0.16, 0.16, 0.17, 1).cylinder(0, -0.3, 0, 0.06, 0.05, 2.7, 8).box(-0.36, 2.36, -0.09, 0.36, 3.08, 0.06);
      face('clock', 0, 2.72, 0.64, 0.64, 0.068);
      face('clock', 0, 2.72, 0.64, 0.64, -0.098, 0, true); // (it has two faces, and both stopped)
    } else if (wish.id === 'tally') {
      // a standing stone, and two smaller ones at its foot
      stone.tint(0.9, 0.9, 0.88, 1).box(-0.72, -0.5, -0.2, 0.72, 1.45, 0.2).box(-0.56, 1.45, -0.16, 0.5, 1.62, 0.16);
      stone.tint(0.8, 0.8, 0.78, 1).box(-0.98, -0.3, -0.05, -0.62, 0.42, 0.4).box(0.6, -0.3, -0.36, 0.92, 0.3, 0.1);
      face('tally', 0, 0.86, 1.26, 0.84, 0.208);
    } else if (wish.id === 'sunflower') {
      metal.tint(0.2, 0.5, 0.14, 1).cylinder(0, -0.1, 0, 0.035, 0.025, 1.6, 6);
      for (const [side, ly] of [[-1, 0.5], [1, 0.8], [-1, 1.1]]) metal.tint(0.22, 0.55, 0.16, 1).box(side > 0 ? 0.02 : -0.3, ly, -0.07, side > 0 ? 0.3 : -0.02, ly + 0.02, 0.07);
      // (two heads, each on its own neck, each looking a little its own way)
      for (const side of [-1, 1]) {
        const hx = side * 0.26, hy = 1.9;
        metal.tint(0.2, 0.5, 0.14, 1).box(Math.min(0, hx) - 0.015, 1.46, -0.015, Math.max(0, hx) + 0.015, 1.5, 0.015).cylinder(hx, 1.48, 0, 0.02, 0.02, 0.32, 5);
        metal.place(hx, hy, 0, side * 0.4);
        for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; metal.tint(1, 0.82, 0.1, 1).box(Math.cos(a) * 0.17 - 0.06, Math.sin(a) * 0.17 - 0.06, 0.03, Math.cos(a) * 0.17 + 0.06, Math.sin(a) * 0.17 + 0.06, 0.05); }
        metal.tint(0.34, 0.2, 0.08, 1).cylinder(0, -0.1, 0.02, 0.1, 0.1, 0.2, 8).box(-0.1, -0.1, 0.02, 0.1, 0.1, 0.075);
        metal.pop();
      }
    } else if (wish.id === 'news') {
      metal.tint(0.62, 0.12, 0.1, 1).box(-0.26, 0.5, -0.2, 0.26, 1.2, 0.2);
      metal.tint(0.12, 0.12, 0.13, 1).cylinder(0, -0.1, 0, 0.05, 0.05, 0.6, 6).cylinder(0, -0.05, 0, 0.22, 0.2, 0.1, 8);
      face('news', 0, 0.85, 0.5, 0.68, 0.206);
    } else if (wish.id === 'scarecrow') {
      // a stake, a stick across it — and on them a yellow suit with its hood and its visor, straw at the cuffs
      wood.tint(0.75, 0.7, 0.62, 1).cylinder(0, -0.4, 0, 0.05, 0.045, 2.5, 6).rod(V(-0.78, 1.45, 0), V(0.78, 1.45, 0), 0.04, 5);
      metal.tint(0.95, 0.8, 0.1, 1).box(-0.26, 0.75, -0.14, 0.26, 1.55, 0.14).box(-0.74, 1.36, -0.09, -0.26, 1.54, 0.09).box(0.26, 1.36, -0.09, 0.74, 1.54, 0.09).box(-0.24, 0.2, -0.12, -0.03, 0.75, 0.12).box(0.03, 0.2, -0.12, 0.24, 0.75, 0.12);
      metal.lathe([[0, 1.55], [0.2, 1.58], [0.25, 1.78], [0.2, 1.98], [0.08, 2.06], [0, 2.07]], 8);
      metal.tint(0.07, 0.09, 0.11, 1).box(-0.15, 1.7, 0.16, 0.15, 1.9, 0.245).box(-0.87, 1.34, -0.07, -0.74, 1.56, 0.07).box(0.74, 1.34, -0.07, 0.87, 1.56, 0.07);
      metal.tint(0.78, 0.64, 0.26, 1).box(-0.21, 0.08, -0.08, -0.06, 0.2, 0.08).box(0.06, 0.08, -0.08, 0.21, 0.2, 0.08);
      face('trefoil', 0, 1.16, 0.24, 0.24, 0.146);
    } else if (wish.id === 'busstop') {
      // a pole with its plate and its timetable, and the bench one waits on
      metal.tint(0.3, 0.32, 0.35, 1).cylinder(-0.9, -0.3, 0, 0.045, 0.045, 2.95, 6).box(-1.13, 1.16, 0.0, -0.67, 1.74, 0.045);
      metal.tint(0.1, 0.3, 0.75, 1).box(-1.16, 2.15, -0.02, -0.64, 2.62, 0.02);
      face('bus', -0.9, 1.45, 0.42, 0.535, 0.052);
      wood.tint(0.72, 0.62, 0.5, 1).box(-0.3, 0.42, -0.2, 1.1, 0.48, 0.2).box(-0.3, 0.48, -0.2, 1.1, 0.92, -0.14);
      metal.tint(0.2, 0.2, 0.22, 1).box(-0.25, -0.2, -0.18, -0.19, 0.42, 0.18).box(0.99, -0.2, -0.18, 1.05, 0.42, 0.18);
    } else if (wish.id === 'trolley') {
      // a trolley of wire, lying half on its side where it was left
      const bar = (x0, y0, z0, x1, y1, z1, r = 0.012) => metal.rod(V(x0, y0, z0), V(x1, y1, z1), r, 4);
      metal.place(0, -0.12, 0, 0, 0.16, 0.42);
      metal.tint(0.62, 0.64, 0.66, 1);
      for (const [by, hw, z0, z1] of [[0.42, 0.2, -0.35, 0.3], [0.9, 0.26, -0.42, 0.4]]) { bar(-hw, by, z0, hw, by, z0); bar(-hw, by, z1, hw, by, z1); bar(-hw, by, z0, -hw, by, z1); bar(hw, by, z0, hw, by, z1); }
      for (const sx of [-1, 1]) for (let i = 0; i <= 5; i++) { const t = i / 5; bar(sx * 0.2, 0.42, -0.35 + 0.65 * t, sx * 0.26, 0.9, -0.42 + 0.82 * t); }
      for (let i = 1; i < 4; i++) { const t = i / 4; bar(-0.2 + 0.4 * t, 0.42, -0.35, -0.26 + 0.52 * t, 0.9, -0.42); bar(-0.2 + 0.4 * t, 0.42, 0.3, -0.26 + 0.52 * t, 0.9, 0.4); bar(-0.2 + 0.4 * t, 0.42, -0.35, -0.2 + 0.4 * t, 0.42, 0.3); }
      for (const sx of [-1, 1]) for (const [zt, zb] of [[-0.35, -0.4], [0.3, 0.34]]) { bar(sx * 0.2, 0.42, zt, sx * 0.21, 0.09, zb, 0.016); }
      metal.tint(0.8, 0.12, 0.1, 1).rod(V(-0.27, 1.0, -0.5), V(0.27, 1.0, -0.5), 0.02, 6);
      bar(-0.26, 0.9, -0.42, -0.27, 1.0, -0.5, 0.014); bar(0.26, 0.9, -0.42, 0.27, 1.0, -0.5, 0.014);
      metal.tint(0.08, 0.08, 0.08, 1);
      for (const sx of [-1, 1]) for (const zb of [-0.4, 0.34]) metal.rod(V(sx * 0.21 - 0.025, 0.06, zb), V(sx * 0.21 + 0.025, 0.06, zb), 0.06, 8);
      metal.pop();
    } else if (wish.id === 'dish') {
      // a dish on its post, turned up at the sky, and the little screen that says what it hears
      metal.tint(0.4, 0.42, 0.44, 1).cylinder(0, -0.3, 0, 0.07, 0.06, 1.75, 6);
      const both = parts.get('doubleSided');
      both.place(x, y, z, yaw); both.place(0, 1.5, 0, 0, 0.85, 0);
      both.tint(0.86, 0.87, 0.9, 1).lathe([[0, 0.0], [0.26, 0.03], [0.5, 0.11], [0.7, 0.24], [0.73, 0.275]], 14);
      both.pop(); both.pop();
      metal.place(0, 1.5, 0, 0, 0.85, 0);
      metal.tint(0.3, 0.3, 0.32, 1).rod(V(0, 0.02, 0), V(0, 0.74, 0), 0.016, 4).box(-0.05, 0.72, -0.05, 0.05, 0.84, 0.05);
      metal.pop();
      metal.tint(0.1, 0.1, 0.11, 1).box(-0.14, 0.82, 0.06, 0.14, 1.12, 0.13);
      face('nosignal', 0, 0.97, 0.2, 0.25, 0.134);
    } else if (wish.id === 'meter') {
      metal.tint(0.35, 0.36, 0.38, 1).cylinder(0, -0.3, 0, 0.035, 0.035, 1.4, 6);
      metal.tint(0.25, 0.27, 0.3, 1).lathe([[0, 1.08], [0.11, 1.1], [0.135, 1.28], [0.1, 1.44], [0, 1.47]], 8);
      metal.tint(0.05, 0.05, 0.06, 1).box(-0.075, 1.2, 0.09, 0.075, 1.37, 0.135);
      face('expired', 0, 1.285, 0.12, 0.15, 0.137);
    } else if (wish.id === 'mailbox') {
      // a box with a round top on its post, its flag up, letters sticking out — and more at its foot
      wood.tint(0.7, 0.62, 0.55, 1).cylinder(0, -0.3, 0, 0.05, 0.045, 1.4, 6);
      metal.tint(0.2, 0.3, 0.5, 1).box(-0.13, 1.08, -0.3, 0.13, 1.24, 0.3).rod(V(0, 1.24, -0.3), V(0, 1.24, 0.3), 0.13, 10);
      metal.tint(0.85, 0.12, 0.1, 1).box(0.135, 1.2, 0.05, 0.15, 1.52, 0.1).box(0.135, 1.42, 0.05, 0.15, 1.52, 0.24);
      metal.tint(0.95, 0.94, 0.9, 1).box(-0.08, 1.12, 0.3, 0.06, 1.15, 0.43).box(-0.05, 1.17, 0.3, 0.09, 1.2, 0.4).box(-0.1, 1.21, 0.28, 0.02, 1.235, 0.38)
        .box(0.18, 0.01, 0.1, 0.4, 0.03, 0.26).box(0.24, 0.03, 0.2, 0.46, 0.05, 0.36).box(-0.42, 0.01, 0.05, -0.2, 0.03, 0.2);
    } else if (wish.id === 'car') {
      // what is left of a car — and the tree that came up through its roof
      metal.tint(0.5, 0.26, 0.14, 1).box(-0.85, 0.22, -1.9, 0.85, 0.82, 1.9);
      metal.tint(0.42, 0.22, 0.12, 1).box(-0.78, 0.82, -1.05, 0.78, 1.38, 0.7);
      metal.tint(0.05, 0.06, 0.07, 1).box(-0.8, 0.92, -0.95, -0.76, 1.28, 0.6).box(0.76, 0.92, -0.95, 0.8, 1.28, 0.6).box(-0.7, 0.92, 0.68, 0.7, 1.28, 0.72).box(-0.7, 0.92, -1.07, 0.7, 1.28, -1.03);
      metal.tint(0.85, 0.82, 0.7, 1).box(-0.72, 0.5, 1.9, -0.42, 0.68, 1.93).box(0.42, 0.5, 1.9, 0.72, 0.68, 1.93);
      metal.tint(0.07, 0.07, 0.07, 1);
      for (const sx of [-1, 1]) for (const sz of [-1.2, 1.25]) metal.rod(V(sx * 0.68, 0.26, sz), V(sx * 0.9, 0.26, sz), 0.34, 10);
      wood.tint(0.6, 0.46, 0.33, 1).cylinder(0.1, 0.3, -0.2, 0.2, 0.13, 3.7, 7);
      for (const [lx, ly, lz, lr] of [[0.1, 4.4, -0.2, 1.4], [-0.9, 3.9, 0.4, 0.95], [1.0, 3.8, -0.7, 0.9]]) { metal.place(lx, 0, lz); metal.tint(0.18 + lr * 0.03, 0.46, 0.15, 1).lathe([[0, ly - lr], [lr * 0.62, ly - lr * 0.78], [lr, ly], [lr * 0.62, ly + lr * 0.78], [0, ly + lr]], 8); metal.pop(); }
    } else if (wish.id === 'phone') {
      // a telephone under its hood, on a post: the hood and its yellow band are what one sees from afar
      metal.tint(0.3, 0.32, 0.35, 1).cylinder(0, -0.3, 0, 0.07, 0.07, 1.3, 8);
      metal.tint(0.1, 0.3, 0.62, 1).box(-0.45, 0.95, -0.1, 0.45, 2.0, -0.05).box(-0.45, 0.95, -0.05, -0.4, 2.0, 0.42).box(0.4, 0.95, -0.05, 0.45, 2.0, 0.42).box(-0.5, 2.0, -0.14, 0.5, 2.07, 0.5).box(-0.45, 0.9, -0.1, 0.45, 0.95, 0.42);
      metal.tint(0.95, 0.78, 0.12, 1).box(-0.5, 2.07, -0.14, 0.5, 2.3, -0.08).box(-0.5, 2.07, 0.44, 0.5, 2.3, 0.5);
      metal.tint(0.15, 0.35, 0.6, 1).box(-0.2, 1.05, 0.03, 0.2, 1.62, 0.2).box(-0.24, 1.62, -0.02, 0.24, 1.68, 0.26);
      metal.tint(0.75, 0.76, 0.78, 1).box(-0.06, 1.12, 0.2, 0.15, 1.38, 0.215);
      metal.tint(0.06, 0.06, 0.07, 1).box(-0.17, 1.2, 0.2, -0.1, 1.55, 0.265).box(-0.14, 0.86, 0.2, -0.13, 1.2, 0.21);
      for (let i = 0; i < 9; i++) metal.tint(0.2, 0.2, 0.22, 1).box(-0.04 + (i % 3) * 0.06, 1.15 + Math.floor(i / 3) * 0.07, 0.215, 0.0 + (i % 3) * 0.06, 1.2 + Math.floor(i / 3) * 0.07, 0.222);
    } else if (wish.id === 'forecast') {
      for (const lx of [-0.5, 0.5]) wood.tint(0.7, 0.65, 0.6, 1).cylinder(lx, -0.3, 0, 0.045, 0.04, 2.1, 6);
      wood.tint(0.5, 0.45, 0.4, 1).box(-0.66, 0.78, -0.03, 0.66, 1.8, 0.0);
      face('forecast', 0, 1.29, 1.24, 0.96, 0.012);
    } else if (wish.id === 'telescope') {
      // a coin telescope on its pedestal: a foot, a post, the brass box that took the coins, and the head — two
      // barrels side by side, a lens at the end of each
      metal.tint(0.28, 0.3, 0.33, 1).cylinder(0, 0, 0, 0.21, 0.17, 0.08, 10).cylinder(0, 0.08, 0, 0.07, 0.06, 1.05, 8);
      metal.tint(0.78, 0.62, 0.16, 1).box(-0.11, 0.6, 0.05, 0.11, 0.86, 0.14);
      metal.tint(0.05, 0.05, 0.06, 1).box(-0.018, 0.75, 0.14, 0.018, 0.8, 0.146);
      metal.tint(0.84, 0.85, 0.88, 1).box(-0.2, 1.12, -0.2, 0.2, 1.36, 0.24);
      for (const sx of [-0.1, 0.1]) {
        metal.tint(0.74, 0.76, 0.8, 1).rod(V(sx, 1.25, 0.24), V(sx, 1.25, 0.46), 0.078, 10);
        metal.tint(0.1, 0.16, 0.24, 1).rod(V(sx, 1.25, 0.46), V(sx, 1.25, 0.47), 0.062, 10);
        metal.tint(0.1, 0.1, 0.11, 1).rod(V(sx, 1.25, -0.27), V(sx, 1.25, -0.2), 0.046, 8);
      }
      metal.tint(0.75, 0.12, 0.1, 1).box(-0.2, 1.36, -0.2, 0.2, 1.39, 0.24);
    } else if (wish.id === 'gnome') {
      // a garden gnome, a big one: boots, a blue coat with its belt, a white beard, a red hat — and a gas mask
      // with its two round glasses and its filter
      metal.tint(0.16, 0.12, 0.1, 1).box(-0.14, 0, -0.06, -0.02, 0.08, 0.13).box(0.02, 0, -0.06, 0.14, 0.08, 0.13);
      metal.tint(0.16, 0.36, 0.7, 1).lathe([[0, 0.07], [0.18, 0.07], [0.21, 0.2], [0.18, 0.4], [0.11, 0.49], [0, 0.49]], 10);
      metal.tint(0.12, 0.1, 0.09, 1).cylinder(0, 0.25, 0, 0.2, 0.2, 0.04, 10);
      metal.tint(0.9, 0.72, 0.2, 1).box(-0.035, 0.245, 0.185, 0.035, 0.295, 0.21);
      metal.tint(0.93, 0.76, 0.62, 1).lathe([[0, 0.47], [0.1, 0.49], [0.13, 0.59], [0.1, 0.69], [0, 0.71]], 10);
      metal.tint(0.96, 0.96, 0.94, 1).box(-0.1, 0.34, 0.07, 0.1, 0.52, 0.16).box(-0.06, 0.26, 0.09, 0.06, 0.34, 0.15);
      metal.tint(0.17, 0.19, 0.18, 1).box(-0.09, 0.5, 0.07, 0.09, 0.65, 0.145).rod(V(0, 0.54, 0.13), V(0, 0.5, 0.25), 0.05, 8);
      metal.tint(0.5, 0.52, 0.5, 1).rod(V(0, 0.5, 0.25), V(0, 0.49, 0.28), 0.058, 8);
      metal.tint(0.55, 0.78, 0.84, 1).rod(V(-0.045, 0.61, 0.14), V(-0.045, 0.61, 0.152), 0.032, 8).rod(V(0.045, 0.61, 0.14), V(0.045, 0.61, 0.152), 0.032, 8);
      metal.tint(0.85, 0.12, 0.1, 1).lathe([[0, 0.67], [0.14, 0.67], [0.105, 0.79], [0.05, 0.97], [0, 1.1]], 10);
    } else if (wish.id === 'bottle') {
      // a great green bottle the sea left standing in the sand, leaning; the paper rolled in its neck; the sand it
      // dug itself into, a shell or two
      stone.tint(1.0, 0.93, 0.74, 1).lathe([[0, 0.08], [0.2, 0.06], [0.4, -0.06]], 10);
      metal.place(0.02, 0.0, 0, 0, 0, 0.3);
      metal.tint(0.1, 0.44, 0.26, 1).lathe([[0, 0], [0.13, 0.0], [0.15, 0.06], [0.15, 0.36], [0.11, 0.46], [0.052, 0.54], [0.048, 0.68], [0.058, 0.69], [0.058, 0.72], [0, 0.72]], 10);
      metal.tint(0.97, 0.94, 0.84, 1).cylinder(0, 0.62, 0, 0.03, 0.03, 0.22, 6);
      metal.pop();
      metal.tint(0.97, 0.9, 0.85, 1).lathe([[0, 0.05], [0.06, 0.05], [0.04, 0.09], [0, 0.1]], 6);
      for (const [lx, lz, k] of [[0.3, 0.16, 0.05], [-0.26, 0.2, 0.04], [0.12, 0.3, 0.035]]) { metal.place(lx, 0.02, lz); metal.tint(0.98, 0.86, 0.8, 1).lathe([[0, 0], [k, 0], [k * 0.6, k * 0.5], [0, k * 0.6]], 6); metal.pop(); }
    } else if (wish.id === 'postcards') {
      // a rack that turns, on its foot: four faces of wire, eight cards on each — every one bleached nearly
      // white, a ghost of a sky left on some — and a little red cap
      metal.tint(0.2, 0.2, 0.22, 1).cylinder(0, -0.2, 0, 0.3, 0.26, 0.26, 10).cylinder(0, 0.06, 0, 0.035, 0.035, 1.76, 6);
      metal.tint(0.75, 0.12, 0.1, 1).lathe([[0, 1.8], [0.31, 1.8], [0.27, 1.88], [0, 1.97]], 8);
      for (let f = 0; f < 4; f++) {
        metal.place(0, 0, 0, (f * Math.PI) / 2 + 0.3);
        metal.tint(0.32, 0.32, 0.35, 1).box(-0.2, 0.55, 0.2, 0.2, 1.72, 0.212);
        for (let row = 0; row < 4; row++) for (let col = 0; col < 2; col++) {
          const k = f * 8 + row * 2 + col, pale = 0.9 + ((k * 37) % 7) * 0.012, x0 = -0.18 + col * 0.19, y0 = 0.61 + row * 0.28;
          metal.tint(pale + 0.03, pale, pale - 0.06, 1).box(x0, y0, 0.212, x0 + 0.17, y0 + 0.23, 0.222);
          if (k % 3 !== 1) metal.tint(0.78, 0.86, 0.9, 1).box(x0 + 0.012, y0 + 0.1, 0.222, x0 + 0.158, y0 + 0.218, 0.225);
        }
        metal.pop();
      }
    } else if (wish.id === 'tins') {
      // a larder for the end of the world: tins in rows, one fewer each row up, each with its band of paper —
      // and two that rolled off
      let k = 0;
      for (let row = 0; row < 7; row++) {
        for (let i = 0, n = 8 - row; i < n; i++, k++) {
          const lx = (i - (n - 1) / 2) * 0.21, lz = ((k * 13) % 5) * 0.012 - 0.03, y0 = row * 0.2;
          metal.tint(0.72, 0.74, 0.77, 1).cylinder(lx, y0, lz, 0.095, 0.095, 0.195, 10);
          metal.tint(...(k % 5 === 3 ? [0.9, 0.52, 0.22] : [0.98, 0.74, 0.3]), 1).cylinder(lx, y0 + 0.04, lz, 0.099, 0.099, 0.115, 10);
        }
      }
      metal.tint(0.72, 0.74, 0.77, 1).rod(V(1.02, 0.095, 0.3), V(1.2, 0.095, 0.36), 0.095, 10).rod(V(-1.0, 0.095, 0.45), V(-0.83, 0.095, 0.55), 0.095, 10);
      metal.tint(0.98, 0.74, 0.3, 1).rod(V(1.058, 0.095, 0.312), V(1.162, 0.095, 0.348), 0.099, 10).rod(V(-0.966, 0.095, 0.47), V(-0.864, 0.095, 0.53), 0.099, 10);
    } else if (wish.id === 'bunker') {
      // a mound the grass has taken back; in it a round steel hatch, ajar; a pipe to breathe by; and the tube of a
      // periscope (its head is a part of its own: it turns to look at who comes — see below)
      stone.tint(0.5, 0.62, 0.36, 1).lathe([[0, -0.4], [1.95, -0.4], [1.75, 0.12], [1.25, 0.58], [0.55, 0.86], [0, 0.92]], 12);
      metal.tint(0.3, 0.32, 0.34, 1).cylinder(0, 0.8, 0.4, 0.52, 0.52, 0.12, 12);
      metal.place(0, 0.94, -0.08, 0, -0.5, 0);
      metal.tint(0.42, 0.44, 0.46, 1).cylinder(0, 0, 0.48, 0.5, 0.5, 0.07, 12);
      metal.tint(0.75, 0.6, 0.12, 1).cylinder(0, 0.07, 0.48, 0.17, 0.17, 0.04, 8);
      metal.pop();
      metal.tint(0.3, 0.3, 0.32, 1).cylinder(-0.95, 0.25, -0.5, 0.07, 0.07, 0.85, 6).cylinder(-0.95, 1.1, -0.5, 0.13, 0.13, 0.06, 6);
      metal.tint(0.25, 0.3, 0.22, 1).cylinder(0.9, 0.25, -0.3, 0.045, 0.045, 1.3, 6);
      scope = { x: x + 0.9 * c - 0.3 * s, y: y + 1.55, z: z - 0.9 * s - 0.3 * c };
    }
    for (const b of [metal, wood, stone]) b.pop();
    const r = Math.min(say.r, 1.1);
    // what one walks into: the thing itself — its posts for the billboard, its pole and its bench for the bus stop,
    // the whole length of the car, the mound of the shelter
    if (wish.id === 'billboard') for (const lx of [-1.45, 1.45]) zone.colliders.push({ type: 'circle', x: x + lx * c, z: z - lx * s, r: 0.2 });
    else if (wish.id === 'busstop') zone.colliders.push({ type: 'circle', x: x - 0.9 * c, z: z + 0.9 * s, r: 0.16 }, { type: 'box', x: x + 0.4 * c, z: z - 0.4 * s, hw: 0.75, hl: 0.26, yaw });
    else if (wish.id === 'car') zone.colliders.push({ type: 'box', x, z, hw: 0.92, hl: 1.95, yaw });
    else zone.colliders.push({ type: 'circle', x, z, r: wish.id === 'bunker' ? 1.5 : r * 0.8, ...(wish.y !== undefined && { y0: y - 1, y1: y + 3 }) }); // (up a tower, down a cave: only at its own height)
    taken.built.push({ type: 'circle', x, z, r: say.r });
    list.push({ id: wish.id, x, y, z, yaw, r, settled, under: !!wish.under, label: say.label, text: say.text });
  }
  zone._add(parts, 'relics');
  // ---- the one picture, and the one mesh that carries it
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SHEET;
  paint(canvas.getContext('2d'));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(idx);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, alphaTest: 0.5 }));
  mesh.name = 'relics-faces';
  zone.group.add(mesh);
  // ---- the head of the periscope: it turns towards whoever is near (the game tells it where they are)
  let head = null;
  if (scope) {
    const p = new Parts(), b = p.get('paint');
    b.tint(0.25, 0.3, 0.22, 1).box(-0.07, -0.07, -0.1, 0.07, 0.07, 0.14);
    b.tint(0.05, 0.07, 0.09, 1).box(-0.05, -0.05, 0.14, 0.05, 0.05, 0.155);
    b.tint(0.6, 0.8, 0.9, 1).box(-0.02, 0.0, 0.155, 0.02, 0.03, 0.16);
    head = p.toMeshes(zone.world.materials, { name: 'relics-periscope', layers: [] });
    head.position.set(scope.x, scope.y, scope.z);
    zone.group.add(head);
  }
  return {
    list, mesh, head,
    /** The periscope looks at whoever stands at (px, pz) — when they are near enough to be worth a look. */
    watch: (px, pz) => { if (!head || (px - scope.x) ** 2 + (pz - scope.z) ** 2 > 60 * 60) return; head.rotation.y = Math.atan2(px - scope.x, pz - scope.z); head.updateMatrixWorld(true); },
    /** The relic one stands by (within reach of it), or null. */
    near: (px, pz) => { for (const q of list) if ((q.x - px) ** 2 + (q.z - pz) ** 2 < (q.r + 1.9) ** 2) return q; return null; },
  };
}
