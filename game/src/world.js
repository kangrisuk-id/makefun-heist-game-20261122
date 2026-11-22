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
// Static layer pre-render: marble floor, gold trim, carpets, cover, lamps.
// ---------------------------------------------------------------------------

function drawMarble(ctx, w, h) {
  ctx.fillStyle = '#23202e';
  ctx.fillRect(0, 0, w, h);
  const tile = 68;
  for (let y = 0; y < h / tile; y++) {
    for (let x = 0; x < w / tile; x++) {
      const shade = 30 + ((x * 7 + y * 13) % 5) * 3;
      ctx.fillStyle = `rgb(${shade + 6},${shade + 2},${shade + 16})`;
      ctx.fillRect(x * tile + 1, y * tile + 1, tile - 2, tile - 2);
    }
  }
  ctx.strokeStyle = 'rgba(212,175,55,0.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 26; i++) { // faint gold veins, fixed pattern
    const x = (i * 173) % w;
    const y = (i * 289) % h;
    ctx.moveTo(x, y);
    ctx.lineTo(x + 34 - (i % 5) * 9, y + 22 + (i % 3) * 11);
  }
  ctx.stroke();
}

function drawCoverPiece(ctx, r) {
  if (r.kind === 'pillar') {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const rad = r.w / 2;
    const g = ctx.createRadialGradient(cx - 7, cy - 7, 4, cx, cy, rad);
    g.addColorStop(0, '#8f8fa8');
    g.addColorStop(0.7, '#55556e');
    g.addColorStop(1, '#33334a');
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
    ctx.fillStyle = '#3d2f16';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = 'rgba(170,220,255,0.20)';
    ctx.fillRect(r.x + 5, r.y + 5, r.w - 10, r.h - 10);
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
  ctx.fillStyle = '#3a3652';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = '#494468';
  ctx.fillRect(r.x, r.y, r.w, 5);
  ctx.strokeStyle = 'rgba(212,175,55,0.5)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
}

/** Renders the unchanging parts of a floor to an offscreen canvas (once). */
export function buildStaticLayer(state) {
  const { width, height } = FIELD;
  const cv = document.createElement('canvas');
  cv.width = width;
  cv.height = height;
  const ctx = cv.getContext('2d');
  const def = state.def;

  drawMarble(ctx, width, height);

  // Crimson carpet runners with gold edging.
  for (const [x, y, w, h] of def.carpet) {
    ctx.fillStyle = '#6e1423';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#7d1a2b';
    ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
  }

  // Warm spotlight pools on the floor.
  for (const [lx, ly] of def.lamps) {
    const g = ctx.createRadialGradient(lx, ly, 6, lx, ly, 118);
    g.addColorStop(0, 'rgba(255,196,86,0.30)');
    g.addColorStop(1, 'rgba(255,196,86,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(lx, ly, 118, 0, Math.PI * 2);
    ctx.fill();
  }

  // Outer walls: dark stone with a gold cornice line.
  ctx.fillStyle = '#17141f';
  ctx.fillRect(0, 0, width, WALL_T);
  ctx.fillRect(0, height - WALL_T, width, WALL_T);
  ctx.fillRect(0, 0, WALL_T, height);
  ctx.fillRect(width - WALL_T, 0, WALL_T, height);
  ctx.fillStyle = '#d4af37';
  ctx.fillRect(0, WALL_T - 3, width, 3);
  ctx.fillRect(0, height - WALL_T, width, 3);
  ctx.fillRect(WALL_T - 3, 0, 3, height);
  ctx.fillRect(width - WALL_T, 0, 3, height);

  for (const r of def.cover) drawCoverPiece(ctx, r);

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
