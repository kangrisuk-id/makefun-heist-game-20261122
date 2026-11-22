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

/** Mid-heist on Floor 2: the thief slips through the gap between the two
 *  laser beams while a guard's yellow cone rakes past and both CCTV
 *  cameras sweep their red-orange cones. At t=2.8 both lasers are live. */
export function stagePlayShot() {
  const state = stageCommon(createFloorState(1));
  state.screen = 'play';
  state.time = 2.8; // both laser phases are ON at this frozen instant
  state.thief.x = 626;
  state.thief.y = 416;
  state.thief.facing = 0.35; // slipping right, through the laser gap
  state.thief.sneaking = true;
  state.thief.moving = true;
  state.guards[0].x = 716;
  state.guards[0].y = 286;
  state.guards[0].facing = 2.75; // cone raking down-left, just missing the thief
  state.guards[1].x = 420;
  state.guards[1].y = 690;
  state.guards[1].facing = 0; // cone sweeping the bottom corridor
  state.guards[2].x = 544;
  state.guards[2].y = 150;
  state.guards[2].facing = Math.PI / 2; // cone down the centre, short of the thief
  state.cameras[0].angle = 0.95;
  state.cameras[1].angle = -2.55;
  state.alarm = 28;
  state.alarmPeak = 28;
  state.score = 460;
  state.loots[5].taken = true; // one gem already pocketed
  state.lootTaken = 1;
  state.elapsed = 83;
  return state;
}

/** The moment it goes wrong on Floor 2: alarm at 84%, a guard's cone
 *  locked red on the thief as he sprints the laser gap. */
export function stageAlertShot() {
  const state = stageCommon(createFloorState(1));
  state.screen = 'play';
  state.time = 2.8; // both laser phases are ON at this frozen instant
  state.thief.x = 626;
  state.thief.y = 416;
  state.thief.facing = 0.1; // bolting right, through the laser gap
  state.thief.sprinting = true;
  state.thief.moving = true;
  state.guards[0].x = 330;
  state.guards[0].y = 150;
  state.guards[0].facing = 0.6;
  state.guards[1].x = 500;
  state.guards[1].y = 690;
  state.guards[1].facing = -0.4;
  const hot = state.guards[2];
  hot.x = 792;
  hot.y = 452;
  hot.facing = -2.93; // cone locked onto the thief, clear line over open floor
  hot.alert = 1;
  hot.seenNow = true;
  state.cameras[0].angle = 1.1;
  state.cameras[1].angle = -2.5;
  state.alarm = 84;
  state.alarmPeak = 84;
  state.score = 850;
  state.loots[0].taken = true; // crown already in the sack
  state.loots[3].taken = true; // and a gem
  state.lootTaken = 2;
  state.elapsed = 96;
  return state;
}

/** The win screen over the vault floor, haul tallied. */
export function stageEndShot() {
  const state = stageCommon(createFloorState(2));
  state.screen = 'win';
  state.doorOpen = 1; // the great vault door stands open behind the panel
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
