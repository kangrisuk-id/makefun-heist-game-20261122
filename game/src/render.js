// Drawing only: the game state in, pixels out. The 1088x832 vault is scaled
// to fit the window and centred. Per frame: the pre-rendered static layer,
// the great vault door (floor 3), a dim green wash over the safe shadows,
// lasers with travelling pulses and dust, loot with rising sparkles, feathered
// vision cones (warm yellow guards, red-orange cameras), animated thief and
// guard sprites with walk cycles, grab-burst particles, a flickering lighting
// overlay with a vignette, then the glass-and-gold HUD. Floor changes fade
// and slide; screens (title / caught / win) are panels over the live floor.

import { CAMERA, FIELD, FLOORS, GHOST_ALARM_CAP, GHOST_BONUS, GUARD } from './config.js';
import { buildStaticLayer, conePolygon, exitUnlocked } from './world.js';
import { laserActive } from './cameras.js';

const GOLD = '#d4af37';

// Real-clock seconds for the things the fixed-step clock cannot drive:
// title shimmer, floor transitions, the vault door opening on the win
// screen, and grab-burst particles. Screenshot scenes render a single
// frame, so anything frozen there still lands mid-animation.
let nowS = 0;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function tracePolygon(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

function hash(n) { // deterministic 0..1 from an integer seed
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function drawCone(ctx, ox, oy, facing, halfAngle, range, solids, rgb, strength) {
  const pts = conePolygon(ox, oy, facing, halfAngle, range, solids);
  for (const [scale, alpha] of [[1, 0.13], [0.72, 0.17], [0.45, 0.21]]) {
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    ctx.translate(-ox, -oy);
    ctx.fillStyle = `rgba(${rgb},${alpha * strength})`;
    tracePolygon(ctx, pts);
    ctx.fill();
    ctx.restore();
  }
  const g = ctx.createRadialGradient(ox, oy, 4, ox, oy, range);
  g.addColorStop(0, `rgba(${rgb},${0.27 * strength})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  tracePolygon(ctx, pts);
  ctx.fill();
}

/** Tiny dust motes drifting inside a vision cone, lit by it. */
function drawConeDust(ctx, ox, oy, facing, halfAngle, range, time, rgb, seed) {
  ctx.save();
  ctx.fillStyle = `rgba(${rgb},0.5)`;
  for (let k = 0; k < 9; k++) {
    const frac = (hash(seed * 31 + k * 7) + time * 0.021 * (0.5 + hash(k + seed))) % 1;
    const off = Math.sin(k * 7.3 + seed + time * 0.6) * halfAngle * 0.82;
    const d = frac * range * 0.94;
    const x = ox + Math.cos(facing + off) * d;
    const y = oy + Math.sin(facing + off) * d;
    ctx.globalAlpha = 0.16 + 0.3 * Math.sin(frac * Math.PI);
    ctx.beginPath();
    ctx.arc(x, y, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Safe-shadow wash: a dim green tint wherever no eye is watching.
// ---------------------------------------------------------------------------

let washCanvas = null;

function drawSafeWash(ctx, state) {
  const { width, height } = FIELD;
  if (!washCanvas) washCanvas = document.createElement('canvas');
  washCanvas.width = width;
  washCanvas.height = height;
  const c = washCanvas.getContext('2d');
  c.clearRect(0, 0, width, height);
  c.fillStyle = 'rgba(64,255,150,0.060)';
  c.fillRect(0, 0, width, height);
  c.globalCompositeOperation = 'destination-out';
  c.fillStyle = 'rgba(0,0,0,1)';
  for (const s of state.solids) c.fillRect(s.x, s.y, s.w, s.h); // open floor only
  for (const g of state.guards) {
    tracePolygon(c, conePolygon(g.x, g.y, g.facing, GUARD.coneHalfAngle, GUARD.coneRange, state.solids));
    c.fill();
  }
  for (const cam of state.cameras) {
    if (cam.disabled > 0) continue;
    tracePolygon(c, conePolygon(cam.x, cam.y, cam.angle, CAMERA.coneHalfAngle, CAMERA.coneRange, state.solids));
    c.fill();
  }
  ctx.drawImage(washCanvas, 0, 0);
}

// ---------------------------------------------------------------------------
// The great vault door (floor 3): a giant gold-plated hatch in the floor,
// its iron wheel turning as it swings open on the win screen.
// ---------------------------------------------------------------------------

const DOOR = { x: 544, y: 158, r: 112 };

function drawVaultDoor(ctx, state) {
  if (state.index !== 2) return;
  let open = state.doorOpen ?? 0;
  if (state.screen === 'win' && state.doorOpen === undefined) {
    if (state._winT === undefined) state._winT = nowS;
    open = Math.min(1, Math.max(0, (nowS - state._winT) / 1.6));
    open = 1 - (1 - open) * (1 - open); // ease-out
  }
  const { x, y, r } = DOOR;
  ctx.save();
  // housing rim, fixed to the floor
  ctx.fillStyle = '#141c26';
  ctx.beginPath();
  ctx.arc(x, y, r + 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0a0e14';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(212,175,55,0.65)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r + 8, 0, Math.PI * 2);
  ctx.stroke();
  // the glowing vault interior revealed as the door opens
  const pit = ctx.createRadialGradient(x, y, 6, x, y, r);
  pit.addColorStop(0, `rgba(255,214,110,${0.25 + 0.65 * open})`);
  pit.addColorStop(0.75, `rgba(146,104,20,${0.18 + 0.5 * open})`);
  pit.addColorStop(1, 'rgba(10,8,4,0.9)');
  ctx.fillStyle = pit;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  // the door leaf itself: rotates and slides as it opens
  ctx.save();
  ctx.translate(x + open * 40, y + open * 24);
  ctx.rotate(open * 1.15);
  const leaf = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 8, 0, 0, r);
  leaf.addColorStop(0, '#f4d878');
  leaf.addColorStop(0.55, '#c9a227');
  leaf.addColorStop(0.85, '#96700f');
  leaf.addColorStop(1, '#6e520a');
  ctx.fillStyle = leaf;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#54400a';
  ctx.lineWidth = 3;
  ctx.stroke();
  for (const rr of [r - 14, r - 34]) { // machined rings
    ctx.strokeStyle = 'rgba(84,64,10,0.55)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 10; i++) { // rim bolts
    const a = (i / 10) * Math.PI * 2;
    ctx.fillStyle = '#5d4a12';
    ctx.beginPath();
    ctx.arc(Math.cos(a) * (r - 23), Math.sin(a) * (r - 23), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,190,0.7)';
    ctx.beginPath();
    ctx.arc(Math.cos(a) * (r - 23) - 1.4, Math.sin(a) * (r - 23) - 1.4, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  // the big iron wheel
  ctx.strokeStyle = '#2e3138';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(0, 0, 42, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(200,205,215,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 45.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#2e3138';
  ctx.lineWidth = 6;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * 42, Math.sin(a) * 42);
  }
  ctx.stroke();
  ctx.fillStyle = '#22242a';
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

/** A pulsing glow over the EXIT once every target is lifted. */
function drawExitPulse(ctx, state) {
  if (!exitUnlocked(state)) return;
  const e = state.def.exit;
  const p = 0.5 + 0.5 * Math.sin(state.time * 4.2);
  ctx.save();
  ctx.strokeStyle = `rgba(80,255,160,${0.45 + 0.45 * p})`;
  ctx.lineWidth = 3 + 2 * p;
  ctx.strokeRect(e.x - 3, e.y - 3, e.w + 6, e.h + 6);
  const g = ctx.createRadialGradient(e.x + e.w / 2, e.y + e.h / 2, 4, e.x + e.w / 2, e.y + e.h / 2, 90);
  g.addColorStop(0, `rgba(80,255,160,${0.10 + 0.13 * p})`);
  g.addColorStop(1, 'rgba(80,255,160,0)');
  ctx.fillStyle = g;
  ctx.fillRect(e.x - 60, e.y - 60, e.w + 120, e.h + 120);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Loot, pickups, lasers
// ---------------------------------------------------------------------------

function drawLootIcon(ctx, loot, time) {
  const { x, y } = loot;
  ctx.save();
  ctx.translate(x, y);
  // pedestal glow
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
  g.addColorStop(0, 'rgba(255,220,120,0.35)');
  g.addColorStop(1, 'rgba(255,220,120,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, Math.PI * 2);
  ctx.fill();
  if (loot.kind === 'diamond') {
    ctx.fillStyle = '#bfe9ff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-11, -4); ctx.lineTo(-5, -12); ctx.lineTo(5, -12); ctx.lineTo(11, -4); ctx.lineTo(0, 12);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-11, -4); ctx.lineTo(11, -4); ctx.moveTo(-5, -12); ctx.lineTo(-3, -4); ctx.lineTo(0, 12); ctx.moveTo(5, -12); ctx.lineTo(3, -4); ctx.lineTo(0, 12);
    ctx.stroke();
  } else if (loot.kind === 'gold') {
    ctx.fillStyle = '#e9c34a';
    ctx.strokeStyle = '#9a7414';
    ctx.lineWidth = 1.2;
    for (const [bx, by] of [[-11, 2], [1, 2], [-5, -7]]) {
      ctx.fillRect(bx, by, 11, 7);
      ctx.strokeRect(bx, by, 11, 7);
    }
  } else if (loot.kind === 'crown') {
    ctx.fillStyle = '#f2c531';
    ctx.strokeStyle = '#9a7414';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-12, 8); ctx.lineTo(-12, -6); ctx.lineTo(-6, 1); ctx.lineTo(0, -10); ctx.lineTo(6, 1); ctx.lineTo(12, -6); ctx.lineTo(12, 8);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e33f5e';
    ctx.beginPath();
    ctx.arc(0, 3, 2.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (loot.kind === 'painting') {
    ctx.fillStyle = '#7a5a21';
    ctx.fillRect(-13, -11, 26, 22);
    ctx.fillStyle = '#2d4a6b';
    ctx.fillRect(-10, -8, 20, 16);
    ctx.fillStyle = '#e8dcc0';
    ctx.beginPath();
    ctx.arc(2, -2, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c8b280';
    ctx.fillRect(-10, 4, 20, 4);
  } else { // gem
    ctx.fillStyle = '#7df0c8';
    ctx.strokeStyle = '#d8fff2';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(0, -9); ctx.lineTo(7, 0); ctx.lineTo(0, 9); ctx.lineTo(-7, 0);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
  ctx.restore();

  // Gold sparkles rising off the treasure.
  for (let k = 0; k < 3; k++) {
    const rise = (time * 13 + k * 11 + x * 0.7) % 30;
    const sx = x + Math.sin(time * 2.1 + k * 2.4 + x) * 9;
    const sy = y - 4 - rise;
    const a = 0.75 * (1 - rise / 30);
    ctx.save();
    ctx.strokeStyle = `rgba(255,226,140,${a})`;
    ctx.lineWidth = 1.3;
    const r = 2.6 + 1.6 * Math.sin(time * 3 + k);
    ctx.beginPath();
    ctx.moveTo(sx - r, sy); ctx.lineTo(sx + r, sy);
    ctx.moveTo(sx, sy - r); ctx.lineTo(sx, sy + r);
    ctx.stroke();
    ctx.restore();
  }

  // A bigger glint on the floor's main targets.
  if (loot.required) {
    const tw = 0.5 + 0.5 * Math.sin(time * 2.6 + x);
    const r = 6 + 5 * tw;
    ctx.save();
    ctx.translate(x + 13, y - 13);
    ctx.strokeStyle = `rgba(255,255,230,${0.35 + 0.55 * tw})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-r, 0); ctx.lineTo(r, 0);
    ctx.moveTo(0, -r); ctx.lineTo(0, r);
    ctx.stroke();
    ctx.restore();
  }
}

function drawPickupIcon(ctx, pickup, time) {
  const bob = Math.sin(time * 3 + pickup.x) * 2;
  ctx.save();
  ctx.translate(pickup.x, pickup.y + bob);
  ctx.fillStyle = 'rgba(10,10,20,0.75)';
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 13, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = pickup.kind === 'emp' ? '#8fd0ff' : '#cfcfcf';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(pickup.kind === 'emp' ? '⚡' : '◌', 0, 1);
  ctx.restore();
}

function drawLasers(ctx, state) {
  for (const laser of state.lasers) {
    // The whole assembly breathes a few pixels across its corridor.
    const dx = laser.x2 - laser.x1;
    const dy = laser.y2 - laser.y1;
    const len = Math.hypot(dx, dy) || 1;
    const slide = Math.sin(state.time * 0.9 + laser.phase * 2) * 3;
    const ox = (-dy / len) * slide;
    const oy = (dx / len) * slide;
    // posts
    for (const [px, py] of [[laser.x1 + ox, laser.y1 + oy], [laser.x2 + ox, laser.y2 + oy]]) {
      ctx.fillStyle = '#2c2c3a';
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(212,175,55,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#ff5252';
      ctx.beginPath();
      ctx.arc(px, py, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!laserActive(laser, state.time)) continue;
    const x1 = laser.x1 + ox;
    const y1 = laser.y1 + oy;
    const x2 = laser.x2 + ox;
    const y2 = laser.y2 + oy;
    const pulse = 0.82 + 0.18 * Math.sin(state.time * 5 + laser.phase * 3);
    ctx.save();
    ctx.strokeStyle = `rgba(255,40,40,${0.26 * pulse})`;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,84,84,${0.95 * pulse})`;
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    // a bright bead of light travelling the beam
    const tp = (state.time * 0.55 + laser.phase * 0.37) % 1;
    const bx = x1 + dx * tp;
    const by = y1 + dy * tp;
    const bg = ctx.createRadialGradient(bx, by, 0.5, bx, by, 10);
    bg.addColorStop(0, 'rgba(255,235,235,0.95)');
    bg.addColorStop(0.35, 'rgba(255,110,110,0.55)');
    bg.addColorStop(1, 'rgba(255,80,80,0)');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(bx, by, 10, 0, Math.PI * 2);
    ctx.fill();
    // dust motes drifting along the beam
    ctx.fillStyle = 'rgba(255,190,190,0.6)';
    for (let k = 0; k < 6; k++) {
      const f = (hash(laser.phase * 91 + k * 13) + state.time * 0.03 * (0.4 + hash(k))) % 1;
      const wob = Math.sin(state.time * 1.7 + k * 2.9 + laser.phase) * 3.4;
      ctx.globalAlpha = 0.14 + 0.3 * Math.sin(f * Math.PI);
      ctx.beginPath();
      ctx.arc(x1 + dx * f + (-dy / len) * wob, y1 + dy * f + (dx / len) * wob, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Characters: walk cycles, swinging arms, swaying sacks and cloaks.
// The walk phase is derived from position, so a patrolling guard strides
// as he moves and settles when he pauses — no state fields needed.
// ---------------------------------------------------------------------------

function softShadow(ctx, x, y, rx, ry, bob) {
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx * (1 - 0.10 * bob), ry * (1 - 0.16 * bob), 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawThief(ctx, thief, state) {
  const phase = (thief.x + thief.y) * 0.11;
  const stride = thief.moving ? Math.sin(phase * 2) : 0;
  const bob = thief.moving ? Math.abs(Math.sin(phase * 2)) : 0.5 + 0.5 * Math.sin(state.time * 1.8);
  const bobY = thief.moving ? -Math.abs(Math.sin(phase * 2)) * 1.9 : Math.sin(state.time * 1.8) * 0.4;
  softShadow(ctx, thief.x, thief.y + 13, 16, 6, bob);
  ctx.save();
  ctx.translate(thief.x, thief.y + bobY);
  if (state.smokeTime > 0) ctx.globalAlpha = 0.45;
  ctx.rotate(thief.facing + Math.PI / 2);
  if (thief.sprinting && thief.moving) ctx.scale(1.20, 0.84); // dash-stretch
  ctx.scale(1.22, 1.22);
  const squish = thief.sneaking ? 0.84 : 1;
  ctx.scale(1, squish);
  // cloak tail, swaying behind
  ctx.fillStyle = '#101018';
  ctx.beginPath();
  ctx.moveTo(-7, 6);
  ctx.quadraticCurveTo(Math.sin(phase - 0.7) * 5, 17, Math.sin(phase - 0.7) * 7, 20);
  ctx.quadraticCurveTo(0, 15, 7, 6);
  ctx.closePath();
  ctx.fill();
  // feet, alternating with the stride
  ctx.fillStyle = '#05050a';
  ctx.beginPath();
  ctx.ellipse(-5.5, 11 + stride * 3.4, 3.4, 4.6, 0, 0, Math.PI * 2);
  ctx.ellipse(5.5, 11 - stride * 3.4, 3.4, 4.6, 0, 0, Math.PI * 2);
  ctx.fill();
  // body: black suit
  ctx.fillStyle = '#17171f';
  ctx.beginPath();
  ctx.arc(0, 0, 12.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#43435e';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // arms swinging against the stride
  ctx.fillStyle = '#23232f';
  ctx.beginPath();
  ctx.arc(-11.5, -2 - stride * 3.6, 3.6, 0, Math.PI * 2);
  ctx.arc(11.5, -2 + stride * 3.6, 3.6, 0, Math.PI * 2);
  ctx.fill();
  // the loot sack on the back: sways with the walk and grows with the haul
  const sackR = 6 + Math.min(7, state.lootTaken * 0.9);
  ctx.save();
  ctx.translate(-9, 8);
  ctx.rotate(Math.sin(phase - 0.6) * (thief.moving ? 0.38 : 0.1));
  ctx.fillStyle = '#5a4632';
  ctx.beginPath();
  ctx.arc(0, 2, sackR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3a2c1e';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = GOLD;
  ctx.fillRect(-1.6, -sackR + 0.5, 3.2, 3.2); // the knot
  if (state.lootTaken >= 3) { // gold peeking out of a full sack
    ctx.fillStyle = '#f2c531';
    ctx.beginPath();
    ctx.arc(-2.4, -sackR + 3.4, 2.1, 0, Math.PI * 2);
    ctx.arc(2.6, -sackR + 3, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // hood and masked face, looking toward facing (up in local space)
  ctx.fillStyle = '#0c0c12';
  ctx.beginPath();
  ctx.arc(0, -3.5, 7.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8c39a';
  ctx.beginPath();
  ctx.arc(0, -3.2, 5.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0a0a0f'; // mask band
  ctx.fillRect(-5.9, -6.2, 11.8, 4.2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-3.7, -5, 2.5, 1.8);
  ctx.fillRect(1.2, -5, 2.5, 1.8);
  ctx.fillStyle = '#0c0c12'; // hood peak
  ctx.beginPath();
  ctx.moveTo(-7.4, -6.5);
  ctx.quadraticCurveTo(0, -13.5, 7.4, -6.5);
  ctx.quadraticCurveTo(0, -9.5, -7.4, -6.5);
  ctx.fill();
  ctx.restore();
  if (thief.sneaking) {
    ctx.fillStyle = 'rgba(220,220,255,0.75)';
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('sneaking', thief.x, thief.y - 25);
  }
}

function drawGuard(ctx, g, index, time) {
  const phase = (g.x + g.y) * 0.10 + index * 2.1;
  const stride = Math.sin(phase * 2);
  const bobY = -Math.abs(Math.sin(phase * 2)) * 1.6;
  softShadow(ctx, g.x, g.y + 14, 17, 6, Math.abs(Math.sin(phase * 2)));
  ctx.save();
  ctx.translate(g.x, g.y + bobY);
  ctx.rotate(g.facing + Math.PI / 2);
  ctx.scale(1.2, 1.2);
  // boots alternating
  ctx.fillStyle = '#101623';
  ctx.beginPath();
  ctx.ellipse(-6, 12 + stride * 3.6, 3.6, 4.8, 0, 0, Math.PI * 2);
  ctx.ellipse(6, 12 - stride * 3.6, 3.6, 4.8, 0, 0, Math.PI * 2);
  ctx.fill();
  // uniform body
  ctx.fillStyle = '#274b8f';
  ctx.beginPath();
  ctx.arc(0, 0, 13.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#12264d';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = '#1d3a6e'; // shoulder pads
  ctx.beginPath();
  ctx.arc(-10.5, -7, 4.2, 0, Math.PI * 2);
  ctx.arc(10.5, -7, 4.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = GOLD;
  ctx.fillRect(-4.5, 6.5, 9, 2.4); // belt
  ctx.fillRect(-1, -2, 2, 8); // buttons
  // arms: one swinging, one holding the flashlight up toward facing
  ctx.fillStyle = '#1d3a6e';
  ctx.beginPath();
  ctx.arc(-11.5, -1 + stride * 3.4, 3.8, 0, Math.PI * 2);
  ctx.arc(11, -6, 3.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd76a';
  ctx.beginPath();
  ctx.arc(11.5, -10.5, 2.7, 0, Math.PI * 2);
  ctx.fill();
  // face and cap
  ctx.fillStyle = '#eec39b';
  ctx.beginPath();
  ctx.arc(0, -3.5, 6.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#101c33';
  ctx.fillRect(-3.4, -4.6, 2.2, 1.6);
  ctx.fillRect(1.2, -4.6, 2.2, 1.6);
  ctx.fillStyle = '#16294f';
  ctx.beginPath();
  ctx.arc(0, -5.5, 6.9, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-7.2, -6.6, 14.4, 2.6);
  ctx.fillRect(-3.6, -10.4, 7.2, 3.4); // cap top + brim toward facing
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.arc(0, -8.6, 1.5, 0, Math.PI * 2); // cap badge
  ctx.fill();
  ctx.restore();
  if (g.alert > 0.25) {
    ctx.fillStyle = g.alert >= 1 ? '#ff4444' : '#ffb02e';
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(g.alert >= 1 ? '!' : '?', g.x, g.y - 26);
  }
}

function drawCameraUnit(ctx, cam, time) {
  ctx.save();
  ctx.translate(cam.x, cam.y);
  ctx.fillStyle = '#22222e';
  ctx.fillRect(-11, -8, 22, 16);
  ctx.strokeStyle = cam.disabled > 0 ? '#555' : '#ff5252';
  ctx.lineWidth = 2;
  ctx.strokeRect(-11, -8, 22, 16);
  ctx.rotate(cam.angle + Math.PI / 2);
  ctx.fillStyle = '#3a3a4c';
  ctx.fillRect(-4, 4, 8, 8);
  ctx.fillStyle = cam.disabled > 0 ? '#444' : '#ff2222';
  ctx.beginPath();
  ctx.arc(0, 13, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // blinking REC dot
  if (cam.disabled <= 0 && Math.sin(time * 4.2 + cam.x * 0.13) > -0.2) {
    ctx.fillStyle = '#ff2e2e';
    ctx.beginPath();
    ctx.arc(cam.x + 14, cam.y - 10, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,80,80,0.9)';
    ctx.font = 'bold 6.5px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('REC', cam.x + 18.5, cam.y - 7.5);
  }
  ctx.fillStyle = cam.disabled > 0 ? 'rgba(160,160,160,0.8)' : 'rgba(255,90,90,0.9)';
  ctx.font = 'bold 8px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(cam.disabled > 0 ? 'OFF' : 'CAM', cam.x, cam.y - 13);
}

// ---------------------------------------------------------------------------
// Grab bursts: gold sparks where a treasure just vanished into the sack.
// ---------------------------------------------------------------------------

const fxByState = new WeakMap();

function updateBursts(ctx, state) {
  let fx = fxByState.get(state);
  if (!fx) {
    fx = { taken: state.loots.map((l) => l.taken), parts: [] };
    fxByState.set(state, fx);
  }
  state.loots.forEach((loot, i) => {
    if (loot.taken && !fx.taken[i]) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2 + hash(k * 3 + i) * 0.7;
        const sp = 22 + hash(k + i * 17) * 34;
        fx.parts.push({ x: loot.x, y: loot.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 16, born: nowS });
      }
    }
    fx.taken[i] = loot.taken;
  });
  fx.parts = fx.parts.filter((p) => nowS - p.born < 0.7);
  for (const p of fx.parts) {
    const age = nowS - p.born;
    const x = p.x + p.vx * age;
    const y = p.y + p.vy * age - 26 * age * age;
    const a = 1 - age / 0.7;
    ctx.save();
    ctx.strokeStyle = `rgba(255,220,120,${a})`;
    ctx.lineWidth = 1.5;
    const r = 3.2 * a + 0.6;
    ctx.beginPath();
    ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
    ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
    ctx.stroke();
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Lighting: darkness with flickering warm pools cut out of it.
// ---------------------------------------------------------------------------

let lightCanvas = null;

function drawLighting(ctx, state) {
  const { width, height } = FIELD;
  if (!lightCanvas) lightCanvas = document.createElement('canvas');
  lightCanvas.width = width;
  lightCanvas.height = height;
  const c = lightCanvas.getContext('2d');
  c.clearRect(0, 0, width, height);
  const ambience = [0.34, 0.38, 0.42][state.index] ?? 0.38;
  c.fillStyle = `rgba(5,5,16,${ambience})`;
  c.fillRect(0, 0, width, height);
  c.globalCompositeOperation = 'destination-out';
  const hole = (x, y, r, a) => {
    const g = c.createRadialGradient(x, y, 4, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  };
  for (const [lx, ly] of state.def.lamps) {
    const flicker = 0.92 + 0.08 * Math.sin(state.time * 11 + lx * 0.71 + ly * 1.31);
    hole(lx, ly, 122, 0.75 * flicker);
  }
  hole(state.thief.x, state.thief.y, 76, 0.55);
  for (const g of state.guards) hole(g.x, g.y, 46, 0.4);
  ctx.drawImage(lightCanvas, 0, 0);
  // vignette
  const v = ctx.createRadialGradient(width / 2, height / 2, height * 0.42, width / 2, height / 2, height * 0.78);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.40)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, width, height);
  // alarm: the whole room's edges pulse red
  if (state.alarm > 55) {
    const p = 0.5 + 0.5 * Math.sin(state.time * 7);
    ctx.strokeStyle = `rgba(255,40,40,${0.30 + 0.38 * p})`;
    ctx.lineWidth = 9;
    ctx.strokeRect(4, 4, width - 8, height - 8);
    ctx.strokeStyle = `rgba(255,90,60,${0.16 + 0.2 * p})`;
    ctx.lineWidth = 22;
    ctx.strokeRect(12, 12, width - 24, height - 24);
  }
}

// ---------------------------------------------------------------------------
// HUD: glass panels, gold borders, small drawn icons, striped alarm bar.
// ---------------------------------------------------------------------------

function panel(ctx, x, y, w, h, stroke = GOLD) {
  ctx.fillStyle = 'rgba(10,10,22,0.78)';
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 9);
  ctx.fill();
  ctx.stroke();
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function drawSackIcon(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#8a6a3c';
  ctx.beginPath();
  ctx.arc(0, 2.5, 6.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = GOLD;
  ctx.fillRect(-1.6, -6.4, 3.2, 3.4);
  ctx.fillStyle = '#5d4525';
  ctx.font = 'bold 8px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('$', 0, 5.4);
  ctx.restore();
}

function drawKeyIcon(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(-3.4, 0, 3.6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-0.4, 2.4);
  ctx.lineTo(6.4, 6);
  ctx.moveTo(3.4, 4.6);
  ctx.lineTo(6.2, 2.8);
  ctx.stroke();
  ctx.restore();
}

function drawBarsIcon(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#e9c34a';
  ctx.strokeStyle = '#9a7414';
  ctx.lineWidth = 0.9;
  for (const [bx, by] of [[-8, 1.5], [1.5, 1.5], [-3.2, -4.5]]) {
    ctx.fillRect(bx, by, 8, 4.6);
    ctx.strokeRect(bx, by, 8, 4.6);
  }
  ctx.restore();
}

function drawHud(ctx, state) {
  const def = state.def;
  // left: floor + objective
  panel(ctx, 12, 10, 400, 56);
  ctx.fillStyle = GOLD;
  ctx.font = 'bold 16px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(def.name, 24, 33);
  ctx.fillStyle = '#e8e2d0';
  ctx.font = '11.5px system-ui, sans-serif';
  ctx.fillText(def.objective, 24, 54);

  // centre: the ALARM meter, prominent — pulsing and striped when hot
  const hot = state.alarm > 55;
  const pulse = hot ? 0.5 + 0.5 * Math.sin(nowS * 6.5) : 0;
  panel(ctx, 424, 10, 300, 56, hot ? `rgba(255,${60 + Math.round(60 * pulse)},50,0.95)` : GOLD);
  ctx.fillStyle = '#ffb0a0';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('⚠ ALARM', 438, 28);
  ctx.fillStyle = '#2a0f14';
  ctx.fillRect(438, 36, 272, 16);
  const frac = state.alarm / 100;
  const grad = ctx.createLinearGradient(438, 0, 710, 0);
  grad.addColorStop(0, '#ffb02e');
  grad.addColorStop(0.6, '#ff7a2e');
  grad.addColorStop(1, '#ff2e2e');
  ctx.fillStyle = grad;
  if (frac > 0) {
    ctx.fillRect(438, 36, 272 * frac, 16);
    if (hot) { // animated hazard stripes over the filled part
      ctx.save();
      ctx.beginPath();
      ctx.rect(438, 36, 272 * frac, 16);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      const off = (nowS * 46) % 18;
      for (let sx = 438 - 18 + off; sx < 438 + 272 * frac; sx += 18) {
        ctx.beginPath();
        ctx.moveTo(sx, 52);
        ctx.lineTo(sx + 8, 36);
        ctx.lineTo(sx + 15, 36);
        ctx.lineTo(sx + 7, 52);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(438, 36, 272, 16);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(state.alarm)}%`, 704, 28);
  ctx.textAlign = 'left';

  // right: score, then a row of icons with counts
  panel(ctx, 736, 10, 340, 56);
  const taken = state.loots.filter((l) => l.taken);
  const reqTaken = state.loots.filter((l) => l.required && l.taken).length;
  const reqTotal = state.loots.filter((l) => l.required).length;
  drawBarsIcon(ctx, 758, 26);
  ctx.fillStyle = '#ffe9a8';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText(`SCORE ${state.score}`, 774, 33);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#e8e2d0';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(`⏱ ${formatTime(state.elapsed)}`, 1062, 33);
  ctx.textAlign = 'left';
  drawSackIcon(ctx, 756, 47);
  ctx.fillStyle = '#e8e2d0';
  ctx.fillText(`${taken.length}/${state.loots.length}`, 768, 51);
  drawKeyIcon(ctx, 812, 47);
  ctx.fillText(`targets ${reqTaken}/${reqTotal}`, 826, 51);
  ctx.fillText(`⚡EMP ×${state.empCharges}`, 934, 51);
  ctx.fillText(`◌ smoke ×${state.smokeCharges}`, 996, 51);

  // bottom hint
  const hint = exitUnlocked(state)
    ? 'All targets lifted — get to the EXIT!'
    : 'WASD move · C sneak · Shift sprint · E grab · Q smoke · F EMP';
  ctx.font = '12px system-ui, sans-serif';
  const wHint = ctx.measureText(hint).width + 28;
  panel(ctx, (FIELD.width - wHint) / 2, FIELD.height - 40, wHint, 28);
  ctx.fillStyle = exitUnlocked(state) ? '#7dffb0' : '#cfc9b8';
  ctx.textAlign = 'center';
  ctx.fillText(hint, FIELD.width / 2, FIELD.height - 21);
  ctx.textAlign = 'left';
}

function drawScreenPanel(ctx, title, titleColor, lines, footer, opts = {}) {
  const { width, height } = FIELD;
  ctx.fillStyle = 'rgba(4,4,12,0.55)';
  ctx.fillRect(0, 0, width, height);
  const w = 620;
  const h = 120 + lines.length * 27 + 54;
  const x = (width - w) / 2;
  const y = opts.bottom ? height - h - 64 : (height - h) / 2 - 30;
  ctx.fillStyle = 'rgba(12,10,24,0.92)';
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 14);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'center';
  if (opts.shimmer) { // the gold title shimmers as light sweeps across it
    const sweep = (Math.sin(nowS * 1.4) * 0.5 + 0.5) * w;
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    const c0 = Math.max(0, (sweep - 90) / w);
    const c1 = Math.min(1, (sweep + 90) / w);
    g.addColorStop(0, GOLD);
    g.addColorStop(c0, GOLD);
    g.addColorStop((c0 + c1) / 2, '#fff3c4');
    g.addColorStop(c1, GOLD);
    g.addColorStop(1, GOLD);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = titleColor;
  }
  ctx.font = 'bold 42px Georgia, serif';
  ctx.fillText(title, width / 2, y + 62);
  ctx.fillStyle = '#e8e2d0';
  ctx.font = '16px system-ui, sans-serif';
  lines.forEach((line, i) => ctx.fillText(line, width / 2, y + 104 + i * 27));
  ctx.fillStyle = GOLD;
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText(footer, width / 2, y + h - 20);
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------------------
// Floor transitions: a quick fade + slide when the floor index changes.
// ---------------------------------------------------------------------------

let lastFloorIndex = null;
let transitionStart = -10;

function beginFrame(ctx, state) {
  if (lastFloorIndex === null) lastFloorIndex = state.index;
  if (state.index !== lastFloorIndex) {
    lastFloorIndex = state.index;
    transitionStart = nowS;
  }
  const p = (nowS - transitionStart) / 0.55;
  if (p < 1 && state.screen === 'play') {
    ctx.translate(0, (1 - p) * (1 - p) * 46);
    return p;
  }
  return 1;
}

function endTransition(ctx, p) {
  if (p >= 1) return;
  ctx.fillStyle = `rgba(3,3,10,${(1 - p) * 0.85})`;
  ctx.fillRect(0, -60, FIELD.width, FIELD.height + 120);
}

/** Paints one frame of the whole game (floor, actors, HUD, any screen). */
export function render(ctx, state) {
  nowS = performance.now() / 1000;
  if (!state.staticLayer) state.staticLayer = buildStaticLayer(state);
  const tp = beginFrame(ctx, state);
  ctx.save();
  if (tp < 1) { /* transform already applied by beginFrame */ }
  ctx.drawImage(state.staticLayer, 0, 0);
  drawVaultDoor(ctx, state);
  drawSafeWash(ctx, state);
  drawExitPulse(ctx, state);

  for (const pickup of state.pickups) if (!pickup.taken) drawPickupIcon(ctx, pickup, state.time);
  for (const loot of state.loots) if (!loot.taken) drawLootIcon(ctx, loot, state.time);
  drawLasers(ctx, state);

  // vision cones under the actors: warm yellow guards, red-orange cameras
  state.guards.forEach((g, i) => {
    const alert = g.alert >= 1;
    const breathe = 1 + 0.022 * Math.sin(state.time * 1.7 + i * 1.9);
    drawCone(ctx, g.x, g.y, g.facing, GUARD.coneHalfAngle, GUARD.coneRange * breathe, state.solids,
      alert ? '255,84,40' : '255,190,70', alert ? 1.25 : 1);
    drawConeDust(ctx, g.x, g.y, g.facing, GUARD.coneHalfAngle, GUARD.coneRange, state.time,
      alert ? '255,150,90' : '255,220,130', i * 7 + 3);
  });
  for (const cam of state.cameras) {
    if (cam.disabled > 0) continue;
    drawCone(ctx, cam.x, cam.y, cam.angle, CAMERA.coneHalfAngle, CAMERA.coneRange, state.solids,
      cam.seenNow ? '255,52,26' : '255,96,40', cam.seenNow ? 1.3 : 0.95);
    drawConeDust(ctx, cam.x, cam.y, cam.angle, CAMERA.coneHalfAngle, CAMERA.coneRange, state.time,
      '255,140,90', cam.x);
  }

  state.guards.forEach((g, i) => drawGuard(ctx, g, i, state.time));
  for (const cam of state.cameras) drawCameraUnit(ctx, cam, state.time);
  drawThief(ctx, state.thief, state);
  if (state.smokeTime > 0) { // smoke cloud remnant
    ctx.fillStyle = 'rgba(200,200,210,0.20)';
    ctx.beginPath();
    ctx.arc(state.thief.x, state.thief.y, 30, 0, Math.PI * 2);
    ctx.fill();
  }
  updateBursts(ctx, state);

  drawLighting(ctx, state);
  ctx.restore();
  endTransition(ctx, tp);
  drawHud(ctx, state);

  if (state.screen === 'title') {
    drawScreenPanel(ctx, 'AURUM VAULT', GOLD, [
      'The Gilded Heist — three floors, one fortune.',
      'Slip past the guards and their sweeping cones, dodge the red CCTV eyes,',
      'time the laser grids, lift every target treasure and vanish through the EXIT.',
      'Sneak with C to stay dim. Sprint with Shift — fast, but loud.',
      'Q drops a smoke bomb (guards only). F fires an EMP (cameras off, 6 s).',
    ], 'Press ENTER to crack the vault', { shimmer: true });
  } else if (state.screen === 'caught') {
    drawScreenPanel(ctx, 'CAUGHT!', '#ff5a4e', [
      'The alarm hit 100% and the vault slammed shut.',
      `You reached ${FLOORS[state.index].name} with ${state.score} points of loot.`,
      'Read the patrols, hug the cover, and try the shadows again.',
    ], 'Press R to retry the heist');
  } else if (state.screen === 'win') {
    const ghost = state.alarmPeak <= GHOST_ALARM_CAP;
    drawScreenPanel(ctx, 'CLEAN GETAWAY!', '#7dffb0', [
      `Total haul: ${state.score} points in ${formatTime(state.elapsed)}`,
      ghost ? `👻 Ghost bonus +${GHOST_BONUS}: the alarm never rose above ${GHOST_ALARM_CAP}%.` : `Alarm peak: ${Math.round(state.alarmPeak)}% — quieter next time earns the ghost bonus.`,
      `Loot taken: ${state.lootTaken} treasures across ${FLOORS.length} floors.`,
      'The Aurum Vault is empty, and nobody saw a thing.',
    ], 'Press R to rob it again', { bottom: true });
  }
}
