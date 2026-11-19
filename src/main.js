import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { Input } from './core/Input.js';
import { World } from './world/World.js';
import { FreeCamera } from './player/FreeCamera.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('view');
const engine = new Engine(canvas);
const input = new Input(canvas);
const world = new World(engine);
const app = { engine, world, input, ready: false, frames: 0, THREE };
window.__mmf = app;

async function boot() {
  await world.load();
  const free = new FreeCamera(engine.camera, input, (x, z) => world.groundAt(x, z));
  app.free = free;
  const cam = (params.get('cam') || '-60,36,-52,215,-18').split(',').map(Number);
  free.setPose(cam[0], cam[1], cam[2], (cam[3] * Math.PI) / 180, (cam[4] * Math.PI) / 180);
  app.setCam = (x, y, z, yaw, pitch) => free.setPose(x, y, z, (yaw * Math.PI) / 180, (pitch * Math.PI) / 180);
  engine.start((dt) => {
    input.update();
    free.update(dt);
    engine.camera.updateMatrixWorld();
    world.update(dt, engine.camera);
    engine.renderer.render(engine.scene, engine.camera);
    app.frames++;
    app.ready = true;
  });
}
boot().catch((err) => { console.error(err); app.error = String(err?.stack || err); });
