// Drawing only: the game state in, pixels out. The 1088x832 vault is scaled
// to fit the window and centred. Per frame: the pre-rendered static layer,
// lasers, loot, feathered vision cones (amber guards, red cameras), the
// thief and guard sprites, a lighting overlay with warm pools and a
// vignette, then the glass-and-gold HUD. Screens (title / caught / win) are
// panels over the live floor view.

import { CAMERA, FIELD, FLOORS, GHOST_ALARM_CAP, GHOST_BONUS, GUARD } from './config.js';
import { buildStaticLayer, conePolygon, exitUnlocked } from './world.js';
import { laserActive } from './cameras.js';

const GOLD = '#d4af37';

function tracePolygon(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
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

  // Sparkle glint on the floor's main targets.
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

function drawThief(ctx, thief, smokeOn) {
  ctx.save();
  ctx.translate(thief.x, thief.y);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 9, 13, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  if (smokeOn) ctx.globalAlpha = 0.45;
  ctx.rotate(thief.facing + Math.PI / 2);
  // loot sack on the back
  ctx.fillStyle = '#5a4632';
  ctx.beginPath();
  ctx.arc(-8, 7, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = GOLD;
  ctx.fillRect(-9.5, 2.5, 3, 3);
  // body: black suit, lower when sneaking
  const squish = thief.sneaking ? 0.82 : 1;
  ctx.scale(1, squish);
  ctx.fillStyle = '#15151d';
  ctx.beginPath();
  ctx.arc(0, 0, 12.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3d3d55';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // head with mask band and eyes looking toward facing (up in local space)
  ctx.fillStyle = '#e8c39a';
  ctx.beginPath();
  ctx.arc(0, -3.5, 6.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(-6.4, -6.4, 12.8, 4.4);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-3.6, -4.9, 2.4, 1.7);
  ctx.fillRect(1.2, -4.9, 2.4, 1.7);
  // gloved hands
  ctx.fillStyle = '#22222f';
  ctx.beginPath();
  ctx.arc(-9, -6, 3.4, 0, Math.PI * 2);
  ctx.arc(9, -6, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (thief.sneaking) {
    ctx.fillStyle = 'rgba(220,220,255,0.75)';
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('sneaking', thief.x, thief.y - 22);
  }
}

function drawGuard(ctx, g) {
  ctx.save();
  ctx.translate(g.x, g.y);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 10, 14, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(g.facing + Math.PI / 2);
  // uniform body
  ctx.fillStyle = '#274b8f';
  ctx.beginPath();
  ctx.arc(0, 0, 13.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#12264d';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = GOLD;
  ctx.fillRect(-1, -2, 2, 9); // belt of buttons
  // arms + flashlight toward facing
  ctx.fillStyle = '#1d3a6e';
  ctx.beginPath();
  ctx.arc(-10, -5, 3.8, 0, Math.PI * 2);
  ctx.arc(10, -5, 3.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd76a';
  ctx.beginPath();
  ctx.arc(10, -9, 2.6, 0, Math.PI * 2);
  ctx.fill();
  // face and cap
  ctx.fillStyle = '#eec39b';
  ctx.beginPath();
  ctx.arc(0, -3.5, 6.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#16294f';
  ctx.beginPath();
  ctx.arc(0, -5.5, 6.8, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-7, -6.4, 14, 2.6);
  ctx.fillRect(-3.4, -9.6, 6.8, 3); // cap top + brim toward facing
  ctx.restore();
  if (g.alert > 0.25) {
    ctx.fillStyle = g.alert >= 1 ? '#ff4444' : '#ffb02e';
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(g.alert >= 1 ? '!' : '?', g.x, g.y - 24);
  }
}

function drawCameraUnit(ctx, cam) {
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
  ctx.fillStyle = cam.disabled > 0 ? 'rgba(160,160,160,0.8)' : 'rgba(255,90,90,0.9)';
  ctx.font = 'bold 8px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(cam.disabled > 0 ? 'OFF' : 'CAM', cam.x, cam.y - 13);
}

function drawLasers(ctx, state) {
  for (const laser of state.lasers) {
    // posts
    for (const [px, py] of [[laser.x1, laser.y1], [laser.x2, laser.y2]]) {
      ctx.fillStyle = '#2c2c3a';
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff5252';
      ctx.beginPath();
      ctx.arc(px, py, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!laserActive(laser, state.time)) continue;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,40,40,0.28)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(laser.x1, laser.y1);
    ctx.lineTo(laser.x2, laser.y2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,80,80,0.95)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(laser.x1, laser.y1);
    ctx.lineTo(laser.x2, laser.y2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawLighting(ctx, state) {
  const { width, height } = FIELD;
  const cv = drawLighting.canvas ?? (drawLighting.canvas = document.createElement('canvas'));
  cv.width = width;
  cv.height = height;
  const c = cv.getContext('2d');
  c.clearRect(0, 0, width, height);
  c.fillStyle = 'rgba(5,5,16,0.40)';
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
  for (const [lx, ly] of state.def.lamps) hole(lx, ly, 120, 0.75);
  hole(state.thief.x, state.thief.y, 74, 0.55);
  for (const g of state.guards) hole(g.x, g.y, 44, 0.4);
  ctx.drawImage(cv, 0, 0);
  // vignette
  const v = ctx.createRadialGradient(width / 2, height / 2, height * 0.42, width / 2, height / 2, height * 0.78);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, width, height);
  // alarm edge pulse
  if (state.alarm > 55) {
    ctx.strokeStyle = `rgba(255,40,40,${0.25 + 0.3 * Math.sin(state.time * 7)})`;
    ctx.lineWidth = 7;
    ctx.strokeRect(3, 3, width - 6, height - 6);
  }
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(10,10,22,0.78)';
  ctx.strokeStyle = GOLD;
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

  // centre: the ALARM meter, prominent
  panel(ctx, 424, 10, 300, 56);
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
  if (frac > 0) ctx.fillRect(438, 36, 272 * frac, 16);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(438, 36, 272, 16);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(state.alarm)}%`, 704, 28);
  ctx.textAlign = 'left';

  // right: score, loot, time, tools
  panel(ctx, 736, 10, 340, 56);
  const taken = state.loots.filter((l) => l.taken);
  const reqTaken = state.loots.filter((l) => l.required && l.taken).length;
  const reqTotal = state.loots.filter((l) => l.required).length;
  ctx.fillStyle = '#ffe9a8';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText(`SCORE ${state.score}`, 750, 33);
  ctx.fillStyle = '#e8e2d0';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(`💰 ${taken.length}/${state.loots.length} loot · targets ${reqTaken}/${reqTotal}`, 750, 54);
  ctx.textAlign = 'right';
  ctx.fillText(`⏱ ${formatTime(state.elapsed)}`, 1062, 33);
  ctx.fillText(`⚡EMP ×${state.empCharges}  ◌ smoke ×${state.smokeCharges}`, 1062, 54);
  ctx.textAlign = 'left';

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

function drawScreenPanel(ctx, title, titleColor, lines, footer) {
  const { width, height } = FIELD;
  ctx.fillStyle = 'rgba(4,4,12,0.55)';
  ctx.fillRect(0, 0, width, height);
  const w = 620;
  const h = 120 + lines.length * 27 + 54;
  const x = (width - w) / 2;
  const y = (height - h) / 2 - 30;
  ctx.fillStyle = 'rgba(12,10,24,0.92)';
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 14);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = titleColor;
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

/** Paints one frame of the whole game (floor, actors, HUD, any screen). */
export function render(ctx, state) {
  if (!state.staticLayer) state.staticLayer = buildStaticLayer(state);
  ctx.drawImage(state.staticLayer, 0, 0);

  for (const pickup of state.pickups) if (!pickup.taken) drawPickupIcon(ctx, pickup, state.time);
  for (const loot of state.loots) if (!loot.taken) drawLootIcon(ctx, loot, state.time);
  drawLasers(ctx, state);

  // vision cones under the actors
  for (const g of state.guards) {
    const alert = g.alert >= 1;
    drawCone(ctx, g.x, g.y, g.facing, GUARD.coneHalfAngle, GUARD.coneRange, state.solids,
      alert ? '255,84,40' : '255,178,64', alert ? 1.25 : 1);
  }
  for (const cam of state.cameras) {
    if (cam.disabled > 0) continue;
    drawCone(ctx, cam.x, cam.y, cam.angle, CAMERA.coneHalfAngle, CAMERA.coneRange, state.solids,
      cam.seenNow ? '255,40,40' : '255,70,60', cam.seenNow ? 1.3 : 0.95);
  }

  for (const g of state.guards) drawGuard(ctx, g);
  for (const cam of state.cameras) drawCameraUnit(ctx, cam);
  drawThief(ctx, state.thief, state.smokeTime > 0);
  if (state.smokeTime > 0) { // smoke cloud remnant
    ctx.fillStyle = 'rgba(200,200,210,0.20)';
    ctx.beginPath();
    ctx.arc(state.thief.x, state.thief.y, 30, 0, Math.PI * 2);
    ctx.fill();
  }

  drawLighting(ctx, state);
  drawHud(ctx, state);

  if (state.screen === 'title') {
    drawScreenPanel(ctx, 'AURUM VAULT', GOLD, [
      'The Gilded Heist — three floors, one fortune.',
      'Slip past the guards and their sweeping cones, dodge the red CCTV eyes,',
      'time the laser grids, lift every target treasure and vanish through the EXIT.',
      'Sneak with C to stay dim. Sprint with Shift — fast, but loud.',
      'Q drops a smoke bomb (guards only). F fires an EMP (cameras off, 6 s).',
    ], 'Press ENTER to crack the vault');
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
    ], 'Press R to rob it again');
  }
}
