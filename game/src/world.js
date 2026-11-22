// The vault's geometry and per-floor state: solid cover, collision, line of
// sight and vision-cone polygons, plus the pre-rendered static floor layer
// (marble, carpets, cases, pillars, lamps) drawn once per floor to an
// offscreen canvas so the frame loop never redraws it.

import { FIELD, FLOORS } from './config.js';

export const WALL_T = 28; // outer wall thickness

export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** All solids of a floor: the four outer walls plus its cover rects. */
export function solidsOf(floor) {
  const { width, height } = FIELD;
  return [
    { x: 0, y: 0, w: width, h: WALL_T, kind: 'wall' },
    { x: 0, y: height - WALL_T, w: width, h: WALL_T, kind: 'wall' },
    { x: 0, y: 0, w: WALL_T, h: height, kind: 'wall' },
    { x: width - WALL_T, y: 0, w: WALL_T, h: height, kind: 'wall' },
    ...floor.cover,
  ];
}

function circleHitsRect(x, y, r, rect) {
  const cx = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const cy = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy < r * r;
}

/** Moves a circle by (dx, dy), sliding along solids axis by axis. */
export function moveCircle(pos, radius, dx, dy, solids) {
  pos.x += dx;
  for (const s of solids) if (circleHitsRect(pos.x, pos.y, radius, s)) pos.x -= dx;
  pos.y += dy;
  for (const s of solids) if (circleHitsRect(pos.x, pos.y, radius, s)) pos.y -= dy;
  return pos;
}

/** Ray vs rect: distance along the ray to the rect, or Infinity. */
function rayRect(ox, oy, dx, dy, rect) {
  let tmin = 0;
  let tmax = Infinity;
  if (Math.abs(dx) < 1e-9) {
    if (ox < rect.x || ox > rect.x + rect.w) return Infinity;
  } else {
    let t1 = (rect.x - ox) / dx;
    let t2 = (rect.x + rect.w - ox) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }
  if (Math.abs(dy) < 1e-9) {
    if (oy < rect.y || oy > rect.y + rect.h) return Infinity;
  } else {
    let t1 = (rect.y - oy) / dy;
    let t2 = (rect.y + rect.h - oy) / dy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }
  return tmax >= tmin ? tmin : Infinity;
}

/** Distance a ray travels before hitting any solid, capped at maxDist. */
export function raycast(ox, oy, angle, maxDist, solids) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let best = maxDist;
  for (const s of solids) {
    const t = rayRect(ox, oy, dx, dy, s);
    if (t < best) best = t;
  }
  return best;
}

/** True when the straight line a->b touches no solid (endpoints excluded). */
export function lineOfSight(ax, ay, bx, by, solids) {
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return true;
  const ux = dx / dist;
  const uy = dy / dist;
  for (const s of solids) {
    const t = rayRect(ax, ay, ux, uy, s);
    if (t > 2 && t < dist - 2) return false;
  }
  return true;
}

/** The visible polygon of a vision cone: fan of rays clipped by cover. */
export function conePolygon(ox, oy, facing, halfAngle, range, solids) {
  const rays = 26;
  const pts = [{ x: ox, y: oy }];
  for (let i = 0; i <= rays; i++) {
    const a = facing - halfAngle + (2 * halfAngle * i) / rays;
    const d = raycast(ox, oy, a, range, solids);
    pts.push({ x: ox + Math.cos(a) * d, y: oy + Math.sin(a) * d });
  }
  return pts;
}

/** Is point (px,py) inside the cone AND visible from its origin? */
export function pointInCone(ox, oy, facing, halfAngle, range, px, py, solids) {
  const dx = px - ox;
  const dy = py - oy;
  const dist = Math.hypot(dx, dy);
  if (dist > range) return 0;
  if (Math.abs(angleDiff(Math.atan2(dy, dx), facing)) > halfAngle) return 0;
  if (!lineOfSight(ox, oy, px, py, solids)) return 0;
  return 1 - dist / range; // 0 at the rim, near 1 at the source
}

/** Fresh runtime state for one floor, built from its config entry. */
export function createFloorState(floorIndex) {
  const def = FLOORS[floorIndex];
  return {
    def,
    index: floorIndex,
    solids: solidsOf(def),
    thief: { x: def.spawn.x, y: def.spawn.y, facing: -Math.PI / 2, sneaking: false, sprinting: false, moving: false },
    guards: def.guards.map((g) => ({
      x: g.waypoints[0][0], y: g.waypoints[0][1],
      waypoints: g.waypoints, target: 1, pause: 0,
      facing: Math.atan2(g.waypoints[1][1] - g.waypoints[0][1], g.waypoints[1][0] - g.waypoints[0][0]),
      alert: 0, // 0 calm, >0 suspicious, 1 has eyes on the thief right now
    })),
    cameras: def.cameras.map((c) => ({ ...c, angle: c.baseAngle, disabled: 0 })),
    lasers: def.lasers.map((l) => ({ ...l, cooldown: 0 })),
    loots: def.loots.map((l) => ({ ...l, taken: false })),
    pickups: def.pickups.map((p) => ({ ...p, taken: false })),
    staticLayer: null, // filled lazily by the renderer
  };
}

export function requiredLeft(state) {
  return state.loots.filter((l) => l.required && !l.taken).length;
}

export function exitUnlocked(state) {
  return requiredLeft(state) === 0;
}

// ---------------------------------------------------------------------------
// Static layer pre-render: one palette per floor — Floor 1 is a bright
// white-gold marble lobby, Floor 2 a dark wood office with warm lamps,
// Floor 3 cold blue steel shot through with gold. Dressing (palms, rope
// barriers, sconces, floor medallions, contents inside the cases) is all
// painted here, along walls and edges only, so the frame loop stays cheap.
// ---------------------------------------------------------------------------

const PALETTES = [
  { // Floor 1 — bright white-gold marble
    tiles: ['#d9d3c1', '#cfc8b2', '#e3ddcb', '#d2cab6'],
    grout: 'rgba(122,102,58,0.40)',
    detail: 'veins',
    carpet: '#7d1a2b', carpetIn: '#902434',
    pool: 'rgba(255,196,86,0.26)',
    outer: '#3b362a', wall: '#57503e', wallTop: '#6b6350',
    pillar: ['#f2ecda', '#cfc7ac', '#a29a80'],
    caseBase: '#6b5724',
  },
  { // Floor 2 — dark wood, warm desk lamps
    tiles: ['#503722', '#48301d', '#573b23', '#422b18'],
    grout: 'rgba(16,8,3,0.55)',
    detail: 'planks',
    carpet: '#274435', carpetIn: '#2f5240',
    pool: 'rgba(255,166,66,0.30)',
    outer: '#241708', wall: '#3a2812', wallTop: '#4c3519',
    pillar: ['#7d5c33', '#54391d', '#38250f'],
    caseBase: '#2e1f0e',
  },
  { // Floor 3 — cold blue steel, glowing gold
    tiles: ['#33465e', '#2d3f54', '#394e66', '#2b3b4f'],
    grout: 'rgba(140,180,220,0.22)',
    detail: 'rivets',
    carpet: '#1e3a5f', carpetIn: '#254a77',
    pool: 'rgba(160,195,255,0.20)',
    outer: '#131e2b', wall: '#22344a', wallTop: '#2d435c',
    pillar: ['#7d94b0', '#4c617a', '#2e4157'],
    caseBase: '#1d2c3f',
  },
];

function drawMarble(ctx, w, h, pal) {
  ctx.fillStyle = pal.tiles[1];
  ctx.fillRect(0, 0, w, h);
  const tile = 68;
  for (let y = 0; y < h / tile; y++) {
    for (let x = 0; x < w / tile; x++) {
      ctx.fillStyle = pal.tiles[(x * 7 + y * 13) % pal.tiles.length];
      ctx.fillRect(x * tile + 1, y * tile + 1, tile - 2, tile - 2);
      if (pal.detail === 'planks') { // wood grain: plank seams + streaks
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(x * tile + 1, y * tile + tile / 2, tile - 2, 1.5);
        ctx.fillStyle = 'rgba(255,214,150,0.07)';
        ctx.fillRect(x * tile + 6, y * tile + 9 + ((x * 5 + y) % 4) * 3, tile - 16, 2);
        ctx.fillRect(x * tile + 10, y * tile + tile / 2 + 8, tile - 24, 2);
      }
      if (pal.detail === 'rivets') { // steel plate corners
        ctx.fillStyle = 'rgba(190,215,245,0.5)';
        for (const [rx, ry] of [[7, 7], [tile - 9, 7], [7, tile - 9], [tile - 9, tile - 9]]) {
          ctx.beginPath();
          ctx.arc(x * tile + rx, y * tile + ry, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
  ctx.strokeStyle = pal.grout;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let gx = 0; gx <= w; gx += tile) { ctx.moveTo(gx, 0); ctx.lineTo(gx, h); }
  for (let gy = 0; gy <= h; gy += tile) { ctx.moveTo(0, gy); ctx.lineTo(w, gy); }
  ctx.stroke();
  if (pal.detail === 'veins') {
    ctx.strokeStyle = 'rgba(178,138,40,0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 30; i++) { // gold veins, fixed pattern
      const x = (i * 173) % w;
      const y = (i * 289) % h;
      ctx.moveTo(x, y);
      ctx.lineTo(x + 34 - (i % 5) * 9, y + 22 + (i % 3) * 11);
    }
    ctx.stroke();
  }
}

function drawCaseContents(ctx, r) {
  // A faint silhouette behind the glass, varied per case: vase, bars, bust.
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const kind = Math.abs(Math.round(r.x + r.y)) % 3;
  ctx.fillStyle = 'rgba(16,12,6,0.5)';
  if (kind === 0) { // vase
    ctx.beginPath();
    ctx.ellipse(cx, cy + 3, 7, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - 2.6, cy - 12, 5.2, 6);
  } else if (kind === 1) { // stacked bars
    ctx.fillRect(cx - 13, cy + 1, 12, 6);
    ctx.fillRect(cx + 1, cy + 1, 12, 6);
    ctx.fillRect(cx - 6, cy - 6, 12, 6);
  } else { // bust on a plinth
    ctx.beginPath();
    ctx.arc(cx, cy - 4, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - 7, cy + 2, 14, 8);
  }
}

function drawCoverPiece(ctx, r, pal) {
  if (r.kind === 'pillar') {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const rad = r.w / 2;
    const g = ctx.createRadialGradient(cx - 7, cy - 7, 4, cx, cy, rad);
    g.addColorStop(0, pal.pillar[0]);
    g.addColorStop(0.7, pal.pillar[1]);
    g.addColorStop(1, pal.pillar[2]);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, rad - 3, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  if (r.kind === 'case') {
    ctx.fillStyle = pal.caseBase;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = 'rgba(170,220,255,0.20)';
    ctx.fillRect(r.x + 5, r.y + 5, r.w - 10, r.h - 10);
    drawCaseContents(ctx, r);
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(r.x + 12, r.y + r.h - 9);
    ctx.lineTo(r.x + r.w * 0.45, r.y + 8);
    ctx.stroke();
    return;
  }
  // plain wall block
  ctx.fillStyle = pal.wall;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = pal.wallTop;
  ctx.fillRect(r.x, r.y, r.w, 5);
  ctx.strokeStyle = 'rgba(212,175,55,0.5)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
}

// --- dressing: palms, rope barriers, sconces, medallions -------------------

function drawPalm(ctx, x, y) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(x, y + 13, 17, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8a4b21'; // terracotta pot with a gold band
  ctx.beginPath();
  ctx.moveTo(x - 10, y + 2);
  ctx.lineTo(x + 10, y + 2);
  ctx.lineTo(x + 7, y + 15);
  ctx.lineTo(x - 7, y + 15);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#d4af37';
  ctx.fillRect(x - 10, y + 2, 20, 3);
  ctx.strokeStyle = '#5d4020';
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(x, y + 3);
  ctx.quadraticCurveTo(x + 2, y - 8, x, y - 13);
  ctx.stroke();
  for (let i = 0; i < 7; i++) { // fronds
    const a = -Math.PI * 0.92 + (i / 6) * Math.PI * 0.84;
    const len = 21 + (i % 3) * 4;
    const ex = x + Math.cos(a) * len;
    const ey = y - 13 + Math.sin(a) * len * 0.55 + 7;
    ctx.strokeStyle = i % 2 ? '#2e7d46' : '#359654';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(x, y - 13);
    ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.55, y - 13 + Math.sin(a) * len * 0.4 - 5, ex, ey);
    ctx.stroke();
  }
}

function drawRopeBarrier(ctx, xs, y) {
  for (let i = 0; i + 1 < xs.length; i++) { // sagging red velvet rope
    const x1 = xs[i];
    const x2 = xs[i + 1];
    ctx.strokeStyle = '#a31621';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.quadraticCurveTo((x1 + x2) / 2, y + 13, x2, y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,120,120,0.35)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x1, y - 1.6);
    ctx.quadraticCurveTo((x1 + x2) / 2, y + 10, x2, y - 1.6);
    ctx.stroke();
  }
  for (const x of xs) { // gold posts
    ctx.fillStyle = '#8a6a1c';
    ctx.fillRect(x - 1.6, y - 2, 3.2, 13);
    ctx.fillStyle = '#e9c34a';
    ctx.beginPath();
    ctx.arc(x, y - 4.4, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8a6a1c';
    ctx.beginPath();
    ctx.ellipse(x, y + 12, 6, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSconce(ctx, x, y) {
  const g = ctx.createRadialGradient(x, y, 2, x, y, 44);
  g.addColorStop(0, 'rgba(255,198,96,0.34)');
  g.addColorStop(1, 'rgba(255,198,96,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, 44, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d4af37';
  ctx.fillRect(x - 2, y - 6, 4, 9);
  ctx.fillStyle = '#ffd76a';
  ctx.beginPath();
  ctx.arc(x, y - 8, 3.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawMedallion(ctx, x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = 'rgba(212,175,55,0.55)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.68, 0, Math.PI * 2);
  ctx.stroke();
  ctx.rotate(Math.PI / 4);
  ctx.strokeRect(-r * 0.48, -r * 0.48, r * 0.96, r * 0.96);
  ctx.restore();
}

function drawDressing(ctx, state, pal) {
  const idx = state.index;
  // palms in the corners (the top-right corner stays clear of the EXIT
  // on floors 1-2; on floor 3 the EXIT is mid-right wall, so it gets one)
  drawPalm(ctx, 60, 62);
  drawPalm(ctx, 60, 768);
  drawPalm(ctx, 1028, 768);
  if (idx === 2) drawPalm(ctx, 1028, 62);
  // rope barrier along the bottom carpet runner, gap at the cross runner
  drawRopeBarrier(ctx, [150, 320, 470, 620, 790, 960], 690);
  // wall sconces on the top and bottom walls
  for (const sx of [200, 544, 888]) {
    drawSconce(ctx, sx, 16);
    drawSconce(ctx, sx, FIELD.height - 16);
  }
  drawSconce(ctx, 16, 416);
  drawSconce(ctx, FIELD.width - 16, 416);
  // floor medallions in the open rooms
  if (idx === 0) drawMedallion(ctx, 544, 416, 46);
  if (idx === 1) {
    drawMedallion(ctx, 160, 416, 32);
    drawMedallion(ctx, 928, 416, 32);
  }
  if (idx === 2) {
    drawMedallion(ctx, 250, 416, 30);
    drawMedallion(ctx, 838, 416, 30);
  }
}

/** Renders the unchanging parts of a floor to an offscreen canvas (once). */
export function buildStaticLayer(state) {
  const { width, height } = FIELD;
  const cv = document.createElement('canvas');
  cv.width = width;
  cv.height = height;
  const ctx = cv.getContext('2d');
  const def = state.def;
  const pal = PALETTES[state.index] ?? PALETTES[0];

  drawMarble(ctx, width, height, pal);

  // Carpet runners in the floor's palette, with gold edging.
  for (const [x, y, w, h] of def.carpet) {
    ctx.fillStyle = pal.carpet;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = pal.carpetIn;
    ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
  }

  // Spotlight pools on the floor, tinted per floor.
  for (const [lx, ly] of def.lamps) {
    const g = ctx.createRadialGradient(lx, ly, 6, lx, ly, 118);
    g.addColorStop(0, pal.pool);
    g.addColorStop(1, 'rgba(255,196,86,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(lx, ly, 118, 0, Math.PI * 2);
    ctx.fill();
  }

  // Outer walls in the floor's stone, with a gold cornice line.
  ctx.fillStyle = pal.outer;
  ctx.fillRect(0, 0, width, WALL_T);
  ctx.fillRect(0, height - WALL_T, width, WALL_T);
  ctx.fillRect(0, 0, WALL_T, height);
  ctx.fillRect(width - WALL_T, 0, WALL_T, height);
  ctx.fillStyle = '#d4af37';
  ctx.fillRect(0, WALL_T - 3, width, 3);
  ctx.fillRect(0, height - WALL_T, width, 3);
  ctx.fillRect(WALL_T - 3, 0, 3, height);
  ctx.fillRect(width - WALL_T, 0, 3, height);

  for (const r of def.cover) drawCoverPiece(ctx, r, pal);

  drawDressing(ctx, state, pal);

  // The EXIT getaway door.
  const e = def.exit;
  ctx.fillStyle = '#0d2b1d';
  ctx.fillRect(e.x, e.y, e.w, e.h);
  ctx.strokeStyle = '#37d488';
  ctx.lineWidth = 3;
  ctx.strokeRect(e.x + 2, e.y + 2, e.w - 4, e.h - 4);
  ctx.fillStyle = '#37d488';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const labelX = e.x + e.w / 2;
  const labelY = e.y + e.h / 2;
  if (e.w >= e.h) {
    ctx.fillText('EXIT', labelX, labelY);
  } else {
    ctx.save();
    ctx.translate(labelX, labelY);
    ctx.rotate(Math.PI / 2);
    ctx.fillText('EXIT', 0, 0);
    ctx.restore();
  }
  return cv;
}
