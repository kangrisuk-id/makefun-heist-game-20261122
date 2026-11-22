// Deterministic screenshot scenes behind ?shot=start|play|alert|end.
// Each scene builds a real floor state and stages it by hand — thief mid-room,
// a guard's cone sweeping past, a camera's red cone, loot waiting, the alarm
// meter set — then freezes it (fixed clock) so the same query always renders
// the same frame. Nothing here is a mock-up: it is the game's own state,
// drawn by the game's own renderer.

import { CAMERA } from './config.js';
import { createFloorState } from './world.js';

const SHOT_TIME = 2.35; // fixed clock: camera sweeps and laser phases freeze here

function stageCommon(state) {
  state.time = SHOT_TIME;
  state.elapsed = 47;
  state.score = 0;
  state.alarmPeak = 0;
  state.lootTaken = 0;
  state.smokeTime = 0;
  state.smokeCharges = 1;
  state.empCharges = 1;
  for (const cam of state.cameras) {
    cam.angle = cam.baseAngle + Math.sin(SHOT_TIME * CAMERA.sweepSpeed) * cam.sweep;
  }
  return state;
}

/** Title over a live floor view: floor 1 staged quietly behind the panel. */
export function stageStartShot() {
  const state = stageCommon(createFloorState(0));
  state.screen = 'title';
  state.thief.x = 430;
  state.thief.y = 640;
  state.thief.facing = -0.6;
  state.guards[0].x = 620;
  state.guards[0].y = 128;
  state.guards[0].facing = 0.5;
  state.guards[1].x = 420;
  state.guards[1].y = 668;
  state.guards[1].facing = Math.PI;
  state.alarm = 12;
  return state;
}

/** Mid-heist: thief crossing the lobby, guard cone amber, camera watching. */
export function stagePlayShot() {
  const state = stageCommon(createFloorState(0));
  state.screen = 'play';
  state.thief.x = 455;
  state.thief.y = 445;
  state.thief.facing = -2.2; // crossing toward the top-left cases
  state.thief.sneaking = true;
  state.guards[0].x = 660;
  state.guards[0].y = 128;
  state.guards[0].facing = 2.5; // cone raking down-left across the room
  state.guards[1].x = 800;
  state.guards[1].y = 668;
  state.guards[1].facing = Math.PI;
  state.alarm = 24;
  state.alarmPeak = 24;
  state.score = 410;
  state.loots[2].taken = true; // one gem already pocketed
  state.lootTaken = 1;
  return state;
}

/** The moment it goes wrong: alarm high, guard cone red, thief bolting. */
export function stageAlertShot() {
  const state = stageCommon(createFloorState(0));
  state.screen = 'play';
  state.thief.x = 470;
  state.thief.y = 520;
  state.thief.facing = 0.3; // bolting right, toward the EXIT side
  state.thief.sprinting = true;
  state.guards[0].x = 660;
  state.guards[0].y = 128;
  state.guards[0].facing = 2.5;
  const hot = state.guards[1];
  hot.x = 700;
  hot.y = 690;
  hot.facing = -2.51; // cone locked onto the thief, clear line over open floor
  hot.alert = 1;
  hot.seenNow = true;
  state.alarm = 84;
  state.alarmPeak = 84;
  state.score = 850;
  state.loots[0].taken = true; // diamond already in the sack
  state.lootTaken = 1;
  return state;
}

/** The win screen over the vault floor, haul tallied. */
export function stageEndShot() {
  const state = stageCommon(createFloorState(2));
  state.screen = 'win';
  state.thief.x = 900;
  state.thief.y = 416;
  state.thief.facing = 0;
  state.alarm = 22;
  state.alarmPeak = 34;
  for (const loot of state.loots) loot.taken = true; // the vault behind the panel is empty
  state.score = 3710;
  state.lootTaken = 12;
  state.elapsed = 264;
  return state;
}

export function stageShot(name) {
  if (name === 'start') return stageStartShot();
  if (name === 'play') return stagePlayShot();
  if (name === 'alert') return stageAlertShot();
  if (name === 'end') return stageEndShot();
  return null;
}
