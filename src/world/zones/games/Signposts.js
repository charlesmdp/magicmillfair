// Wooden signposts at the forks of the paths: a post, and planks nailed to it that point the way to the games —
// their names painted by hand (props/handpaint.js), how far it is underneath. Where they stand and what they
// point to: SIGNPOSTS and WAYS in layout/layout.js.
//
// Cheap to draw: the posts go into the wood of the zone (merged with the rest: no draw call of their own); the
// faces of all the planks are one mesh with one picture (a strip of planks painted once, when the world is
// built). A plank is the same picture on both faces — its words in the middle, so that they read the right
// way round from either side — and its point is cut in the mesh, not in the picture.
import * as THREE from 'three';
import { paintWords, wordsWidth } from '../../props/handpaint.js';
import { SIGNPOSTS, WAYS } from '../../layout/layout.js';

const H = 0.37, THICK = 0.045, TIP = 0.25, BUTT = 0.3; // a plank (m): its height, its thickness, its point, what sticks out behind the post
const LMIN = 1.3, LMAX = 2.15, STEP = 0.44, TOP = 2.95; // …its length, from… to; from a plank to the next below; the middle of the highest
const WOODS = [['#b28350', '#8f6336'], ['#a07447', '#7d5730'], ['#bd9160', '#996f40'], ['#96744f', '#74573a']]; // (a few planks, never the same tree)

/** Numbers in [0, 1) that are always the same for the same word. */
function randomOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  let s = h >>> 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** A plank of sawn wood, (x, y, w, h) on the canvas: its grain, a knot or two, edges that the weather darkened. */
export function paintPlank(ctx, x, y, w, h, seed = '') {
  const rnd = randomOf(`plank|${seed}`), [light, dark] = WOODS[Math.floor(rnd() * WOODS.length)];
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, light); g.addColorStop(1, dark);
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  // the grain: long lines that wander a little
  for (let k = 0; k < 16; k++) {
    const gy = y + rnd() * h, amp = 1 + rnd() * 2.5, len = 60 + rnd() * 90, phase = rnd() * 6;
    ctx.strokeStyle = rnd() < 0.5 ? 'rgba(70, 42, 18, 0.2)' : 'rgba(255, 236, 200, 0.14)';
    ctx.lineWidth = 0.8 + rnd() * 1.4;
    ctx.beginPath();
    for (let px = 0; px <= w; px += 12) { const py = gy + Math.sin(px / len + phase) * amp; if (px === 0) ctx.moveTo(x + px, py); else ctx.lineTo(x + px, py); }
    ctx.stroke();
  }
  // a knot or two
  for (let k = 0, n = 1 + Math.floor(rnd() * 2); k < n; k++) {
    const kx = x + (0.08 + rnd() * 0.84) * w, ky = y + (0.2 + rnd() * 0.6) * h, r = h * (0.05 + rnd() * 0.05);
    for (let q = 3; q >= 1; q--) { ctx.strokeStyle = `rgba(60, 34, 14, ${0.14 + (3 - q) * 0.1})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(kx, ky, r * q * 1.5, r * q, 0, 0, 7); ctx.stroke(); }
    ctx.fillStyle = 'rgba(52, 28, 10, 0.5)'; ctx.beginPath(); ctx.ellipse(kx, ky, r * 1.2, r * 0.8, 0, 0, 7); ctx.fill();
  }
  // the edges, darker — and the ends, where the saw went
  const edge = ctx.createLinearGradient(0, y, 0, y + h);
  edge.addColorStop(0, 'rgba(40, 22, 8, 0.4)'); edge.addColorStop(0.1, 'rgba(40, 22, 8, 0)'); edge.addColorStop(0.9, 'rgba(40, 22, 8, 0)'); edge.addColorStop(1, 'rgba(40, 22, 8, 0.45)');
  ctx.fillStyle = edge; ctx.fillRect(x, y, w, h);
  ctx.restore();
}

/**
 * Plants them. `wood`: the builder the posts go into (already placed in the world: nothing pushed);
 * `spots`: where things really are when the layout only knows roughly ({ race: [x, z] }).
 * Returns { mesh (the faces of the planks), posts: [{ id, x, z, arms: [{ to, text, far, yaw }] }] }.
 */
export function buildSignposts(zone, wood, spots = {}) {
  const tier = zone.world.engine.tier, PX = tier.quality === 0 || tier.phone ? 112 : 168; // pixels to a metre on the planks
  const CH = Math.round(H * PX), CW = Math.round(LMAX * PX), PAD = 3;
  const arms = [];
  for (const post of SIGNPOSTS) {
    const y = zone.ground(post.x, post.z), list = [];
    post.arms.forEach(([to, via], i) => {
      const way = WAYS[to], at = spots[to] || way.at, far = Math.hypot(at[0] - post.x, at[1] - post.z);
      // (how far it is, to the nearest ten metres; nothing is said of what is in sight)
      const metres = far >= 35 ? `${Math.round(far / 10) * 10} M` : '';
      const under = [way.more, metres].filter(Boolean).join(' · ');
      const big = (under ? 0.185 : 0.2) * PX, words = way.text.toUpperCase();
      const length = Math.min(LMAX, Math.max(LMIN, wordsWidth(words, big) / PX + 2 * TIP + 0.1, under ? wordsWidth(under, 0.085 * PX) / PX + 2 * TIP + 0.1 : 0));
      const arm = { post, to, words, under, big, length, y: y + TOP - i * STEP, yaw: Math.atan2(-(via[1] - post.z), via[0] - post.x), side: i % 2 ? -1 : 1, far };
      arms.push(arm); list.push(arm);
    });
    post.built = { y, arms: list };
  }
  // ---- the picture: every plank, one under the other in two columns
  const rows = Math.ceil(arms.length / 2), canvas = document.createElement('canvas');
  canvas.width = 2 * (CW + 2 * PAD); canvas.height = rows * (CH + 2 * PAD);
  const ctx = canvas.getContext('2d');
  arms.forEach((arm, k) => {
    const x0 = (k % 2) * (CW + 2 * PAD), y0 = Math.floor(k / 2) * (CH + 2 * PAD), w = arm.length * PX, seed = `${arm.post.id}:${arm.to}`;
    paintPlank(ctx, x0, y0, CW + 2 * PAD, CH + 2 * PAD, seed); // (the wood runs into the margin: nothing bleeds in from the next plank)
    const mid = x0 + PAD + w / 2, room = w - 2 * TIP * PX - 0.06 * PX;
    const size = Math.min(arm.big, (arm.big * room) / Math.max(1, wordsWidth(arm.words, arm.big)));
    if (arm.under) {
      paintWords(ctx, arm.words, mid, y0 + PAD + CH * 0.6, size, { align: 'center', seed });
      paintWords(ctx, arm.under, mid, y0 + PAD + CH * 0.92, Math.min(0.085 * PX, (0.085 * PX * room) / Math.max(1, wordsWidth(arm.under, 0.085 * PX))), { align: 'center', color: '#ffd76a', weight: 0.15, seed });
    } else paintWords(ctx, arm.words, mid, y0 + PAD + CH / 2 + size / 2, size, { align: 'center', seed });
    arm.uv = { u0: (x0 + PAD) / canvas.width, u1: (x0 + PAD + w) / canvas.width, v0: 1 - (y0 + PAD + CH) / canvas.height, v1: 1 - (y0 + PAD) / canvas.height };
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  // ---- the mesh of the faces, and the wood of the posts and of the edges of the planks
  const pos = [], uv = [], idx = [], m = new THREE.Matrix4(), e = new THREE.Euler(), v = new THREE.Vector3();
  for (const arm of arms) {
    const rnd = randomOf(`${arm.post.id}/${arm.to}`), roll = (rnd() - 0.5) * 0.07, off = arm.side * (0.085 + THICK / 2);
    m.makeRotationFromEuler(e.set(0, arm.yaw, roll, 'YXZ')).setPosition(arm.post.x, arm.y, arm.post.z);
    const xb = -BUTT, xt = arm.length - BUTT, xs = xt - TIP, { u0, u1, v0, v1 } = arm.uv, vm = (v0 + v1) / 2, us = u0 + ((u1 - u0) * (arm.length - TIP)) / arm.length;
    // (the five corners of a plank: the two of its butt, the two where the point starts, the point)
    const corners = [[xb, -H / 2], [xs, -H / 2], [xt, 0], [xs, H / 2], [xb, H / 2]];
    for (const face of [1, -1]) {
      const base = pos.length / 3, z = off + face * (THICK / 2 + 0.002);
      // (behind, the picture runs the other way: the words still read from left to right)
      const us5 = face > 0 ? [u0, us, u1, us, u0] : [u1, u1 - (us - u0), u0, u1 - (us - u0), u1], vs5 = [v0, v0, vm, v1, v1];
      corners.forEach(([x, y], k) => { v.set(x, y, z).applyMatrix4(m); pos.push(v.x, v.y, v.z); uv.push(us5[k], vs5[k]); });
      if (face > 0) idx.push(base, base + 1, base + 2, base, base + 2, base + 3, base, base + 3, base + 4);
      else idx.push(base, base + 2, base + 1, base, base + 3, base + 2, base, base + 4, base + 3);
    }
    // its wood between the two faces, and the two cuts of its point
    wood.push(m);
    const A = (x, y, z) => new THREE.Vector3(x, y, z), z0 = off - THICK / 2, z1 = off + THICK / 2, h = H / 2 - 0.004;
    wood.tint(0.78, 0.6, 0.42, 1).box(xb, -h, z0, xs, h, z1, { tile: 1, faces: 'xyY' });
    wood.quad(A(xs, h, z1), A(xt, 0, z1), A(xt, 0, z0), A(xs, h, z0)).quad(A(xs, -h, z0), A(xt, 0, z0), A(xt, 0, z1), A(xs, -h, z1));
    wood.pop();
  }
  for (const post of SIGNPOSTS) {
    const { y } = post.built, top = TOP + H / 2 + 0.22, rnd = randomOf(`post|${post.id}`);
    wood.place(post.x, y, post.z, rnd() * 6.28, (rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.05);
    wood.tint(0.62, 0.47, 0.34, 1).cylinder(0, -0.5, 0, 0.095, 0.08, top + 0.5, 8);
    wood.tint(0.5, 0.37, 0.26, 1).place(0, top, 0).lathe([[0.11, 0.0], [0.07, 0.07], [0.0, 0.13]], 8).pop();
    wood.pop();
    zone.colliders.push({ type: 'circle', x: post.x, z: post.z, r: 0.2 });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(idx);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  mesh.name = 'signposts';
  return {
    mesh,
    posts: SIGNPOSTS.map((p) => ({ id: p.id, x: p.x, z: p.z, y: p.built.y, arms: p.built.arms.map((a) => ({ to: a.to, text: a.words, under: a.under, far: a.far, yaw: a.yaw, y: a.y, length: a.length })) })),
  };
}
