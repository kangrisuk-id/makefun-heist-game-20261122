// CCTV cameras and laser grids — the vault's electronic eyes.
// Cameras sweep a red cone back and forth; a thief caught in one feeds the
// alarm fast, and smoke does NOT fool them. An EMP charge blinds every camera
// for a few seconds. Laser beams blink on a timer; crossing a live beam
// spikes the alarm.

import { ALARM, CAMERA } from './config.js';
import { pointInCone } from './world.js';

export function laserActive(laser, time) {
  return ((time + laser.phase) % laser.period) < laser.onTime;
}

function segmentCrossesPoint(x1, y1, x2, y2, px, py, r) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + dx * t;
  const cy = y1 + dy * t;
  return Math.hypot(px - cx, py - cy) < r;
}

export function updateCameras(state, dt, events) {
  for (const cam of state.cameras) {
    cam.angle = cam.baseAngle + Math.sin(state.time * CAMERA.sweepSpeed) * cam.sweep;
    if (cam.disabled > 0) {
      cam.disabled -= dt;
      cam.seenNow = false;
      continue;
    }
    const seen = pointInCone(cam.x, cam.y, cam.angle, CAMERA.coneHalfAngle, CAMERA.coneRange, state.thief.x, state.thief.y, state.solids);
    cam.seenNow = seen > 0;
    if (seen > 0) {
      const stance = state.thief.sneaking ? 0.6 : 1;
      state.alarm = Math.min(ALARM.max, state.alarm + ALARM.cameraFillPerSecond * (0.4 + 0.6 * seen) * stance * dt);
      events.cameraSpot = true;
    }
  }
}

export function updateLasers(state, dt, events) {
  for (const laser of state.lasers) {
    laser.cooldown -= dt;
    if (!laserActive(laser, state.time) || laser.cooldown > 0) continue;
    if (segmentCrossesPoint(laser.x1, laser.y1, laser.x2, laser.y2, state.thief.x, state.thief.y, 13)) {
      state.alarm = Math.min(ALARM.max, state.alarm + ALARM.laserSpike);
      laser.cooldown = 0.8;
      events.laserTrip = true;
    }
  }
}

/** Fires the EMP: every camera on the floor goes dark for a few seconds. */
export function fireEmp(state) {
  for (const cam of state.cameras) cam.disabled = CAMERA.empDisableSeconds;
}
