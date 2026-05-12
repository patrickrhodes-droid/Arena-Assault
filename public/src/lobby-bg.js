import * as THREE from "three";
import { game } from "./state.js";

// ── Canvas overlay (hex grid + particles + scan) ──────────────────────────────
let _canvas = null;
let _ctx    = null;
let _bgAnimId = null;

const _particles = [];
const HEX_R = 28;
const PARTICLE_COUNT = 55;

function initParticles(w, h) {
  _particles.length = 0;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    _particles.push({
      x:     Math.random() * w,
      y:     Math.random() * h,
      r:     0.6 + Math.random() * 1.8,
      speed: 0.15 + Math.random() * 0.5,
      alpha: 0.08 + Math.random() * 0.35,
      pulse: Math.random() * Math.PI * 2,
      color: Math.random() < 0.15 ? [255, 100, 50] : [0, 204, 170], // occasional orange spark
    });
  }
}

function drawHexGrid(ctx, w, h) {
  const hx = HEX_R * 1.5;
  const hy = HEX_R * Math.sqrt(3);
  ctx.strokeStyle = "rgba(0,204,170,0.055)";
  ctx.lineWidth   = 0.6;
  ctx.beginPath();
  for (let col = -1; col < w / hx + 2; col++) {
    for (let row = -1; row < h / hy + 2; row++) {
      const x = col * hx;
      const y = row * hy + (col & 1 ? hy * 0.5 : 0);
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        const b = ((i + 1) * Math.PI) / 3;
        ctx.moveTo(x + HEX_R * Math.cos(a), y + HEX_R * Math.sin(a));
        ctx.lineTo(x + HEX_R * Math.cos(b), y + HEX_R * Math.sin(b));
      }
    }
  }
  ctx.stroke();
}

let _scanY    = -1;
let _scanWait = 6;
let _scanDur  = 0;

function tickCanvas(dt) {
  if (!_ctx || !_canvas) return;
  const { width: w, height: h } = _canvas;

  _ctx.clearRect(0, 0, w, h);

  drawHexGrid(_ctx, w, h);

  // Particles
  for (const p of _particles) {
    p.y -= p.speed;
    p.pulse += dt * 1.8;
    if (p.y < -6) {
      p.y = h + 6;
      p.x = Math.random() * w;
    }
    const a = p.alpha * (0.55 + 0.45 * Math.sin(p.pulse));
    _ctx.fillStyle = `rgba(${p.color[0]},${p.color[1]},${p.color[2]},${a})`;
    _ctx.beginPath();
    _ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    _ctx.fill();
  }

  // Scanning beam — sweeps down every ~8s
  _scanWait -= dt;
  if (_scanWait <= 0 && _scanY < 0) {
    _scanY   = -40;
    _scanDur = 0;
    _scanWait = 7 + Math.random() * 5;
  }
  if (_scanY >= 0) {
    _scanY   += (h + 80) * dt * 0.28;
    _scanDur += dt;
    const beam = _ctx.createLinearGradient(0, _scanY - 38, 0, _scanY + 38);
    beam.addColorStop(0,   "rgba(0,220,180,0)");
    beam.addColorStop(0.4, "rgba(0,220,180,0.05)");
    beam.addColorStop(0.5, "rgba(0,220,180,0.11)");
    beam.addColorStop(0.6, "rgba(0,220,180,0.05)");
    beam.addColorStop(1,   "rgba(0,220,180,0)");
    _ctx.fillStyle = beam;
    _ctx.fillRect(0, _scanY - 38, w, 76);
    if (_scanY > h + 60) _scanY = -1;
  }

  // Occasional bright node flash at hex intersections
  if (Math.random() < 0.008) {
    const hx = HEX_R * 1.5;
    const hy = HEX_R * Math.sqrt(3);
    const col = Math.floor(Math.random() * (w / hx));
    const row = Math.floor(Math.random() * (h / hy));
    const nx = col * hx;
    const ny = row * hy + (col & 1 ? hy * 0.5 : 0);
    const grd = _ctx.createRadialGradient(nx, ny, 0, nx, ny, 10);
    grd.addColorStop(0,   "rgba(0,255,200,0.5)");
    grd.addColorStop(1,   "rgba(0,255,200,0)");
    _ctx.fillStyle = grd;
    _ctx.fillRect(nx - 10, ny - 10, 20, 20);
  }
}

let _lastBgTime = 0;

function bgLoop(ts) {
  const dt = Math.min(0.05, (ts - _lastBgTime) / 1000);
  _lastBgTime = ts;
  if (game.state === "MENU") {
    tickCanvas(dt);
  } else {
    // Clear when not in menu
    _ctx?.clearRect(0, 0, _canvas?.width ?? 0, _canvas?.height ?? 0);
  }
  _bgAnimId = requestAnimationFrame(bgLoop);
}

export function initLobbyCanvas() {
  _canvas = document.getElementById("lobby-canvas");
  if (!_canvas) return;
  _ctx = _canvas.getContext("2d");

  function resize() {
    _canvas.width  = window.innerWidth;
    _canvas.height = window.innerHeight;
    initParticles(_canvas.width, _canvas.height);
  }
  resize();
  window.addEventListener("resize", resize);

  if (!_bgAnimId) bgLoop(performance.now());
}

// ── Menu camera orbit ──────────────────────────────────────────────────────────
export function tickMenuOrbit(dt) {
  if (game.state !== "MENU") return;
  game.menuOrbit = (game.menuOrbit ?? 0) + dt * 0.11;
  const t     = game.menuOrbit;
  const R     = 20;
  const camY  = 7.5 + Math.sin(t * 0.35) * 2.2;
  const camX  = Math.sin(t) * R;
  const camZ  = Math.cos(t) * R;
  game.camera.position.set(camX, camY, camZ);
  game.camera.lookAt(0, 1.5, 0);
}
