// AURUM VAULT — boot and the one game loop. Input is read every frame, the
// world advances in fixed 1/60 s steps, and the renderer paints the result.
// Screens: title, play, caught, win. ?shot=start|play|alert|end stages a
// frozen screenshot scene instead of starting the loop.

import { ACT_CONFIRM, ACT_EMP, ACT_GRAB, ACT_RESTART, ACT_SMOKE, createInput } from './input.js';
import { ALARM, FIELD, FLOORS, GHOST_BONUS, LOOT_VALUES, STEP, THIEF, TOOLS } from './config.js';
import { createFloorState, exitUnlocked, moveCircle } from './world.js';
import { updateGuards } from './guards.js';
import { fireEmp, updateCameras, updateLasers } from './cameras.js';
import { render } from './render.js';
import { sfx, unlockAudio } from './audio.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');
const input = createInput();

function fitCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

function drawFrame(state) {
  const scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0a0a14';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate((canvas.width - FIELD.width * scale) / 2, (canvas.height - FIELD.height * scale) / 2);
  ctx.scale(scale, scale);
  render(ctx, state);
}

/** A fresh run: floor 1, empty sack, tools charged. */
function createRun() {
  const state = createFloorState(0);
  state.screen = 'title';
  state.score = 0;
  state.elapsed = 0;
  state.alarm = 0;
  state.alarmPeak = 0;
  state.time = 0;
  state.smokeTime = 0;
  state.smokeCharges = TOOLS.smokeChargesStart;
  state.empCharges = TOOLS.empChargesStart;
  state.lootTaken = 0;
  state.tickClock = 0;
  return state;
}

function nextFloor(state) {
  const carried = {
    score: state.score, elapsed: state.elapsed, alarmPeak: state.alarmPeak,
    smokeCharges: state.smokeCharges, empCharges: state.empCharges, lootTaken: state.lootTaken,
  };
  const fresh = createFloorState(state.index + 1);
  Object.assign(state, fresh, carried, {
    screen: 'play', alarm: 0, time: 0, smokeTime: 0, tickClock: 0,
  });
}

function stepGame(state, dt) {
  const actions = input.takeActions();

  if (state.screen === 'title') {
    if (actions & ACT_CONFIRM) { unlockAudio(); state.screen = 'play'; }
    return;
  }
  if (state.screen === 'caught' || state.screen === 'win') {
    if (actions & ACT_RESTART) Object.assign(state, createRun(), { screen: 'play' });
    return;
  }

  state.time += dt;
  state.elapsed += dt;
  if (state.smokeTime > 0) state.smokeTime -= dt;

  // --- the thief -----------------------------------------------------------
  const move = input.moveVector();
  const thief = state.thief;
  thief.sneaking = input.sneaking();
  thief.sprinting = input.sprinting() && !thief.sneaking;
  thief.moving = move.x !== 0 || move.y !== 0;
  if (thief.moving) {
    const speed = thief.sneaking ? THIEF.sneakSpeed : thief.sprinting ? THIEF.sprintSpeed : THIEF.walkSpeed;
    const len = Math.hypot(move.x, move.y);
    moveCircle(thief, THIEF.radius, (move.x / len) * speed * dt, (move.y / len) * speed * dt, state.solids);
    thief.facing = Math.atan2(move.y, move.x);
    if (thief.sprinting && state.alarm < ALARM.max) {
      state.alarm = Math.min(ALARM.max, state.alarm + 2.2 * dt); // running is loud
    }
  }

  // --- tools ---------------------------------------------------------------
  if ((actions & ACT_SMOKE) && state.smokeCharges > 0 && state.smokeTime <= 0) {
    state.smokeCharges -= 1;
    state.smokeTime = TOOLS.smokeSeconds;
    sfx.smoke();
  }
  if ((actions & ACT_EMP) && state.empCharges > 0) {
    state.empCharges -= 1;
    fireEmp(state);
    sfx.emp();
  }

  // --- grabbing ------------------------------------------------------------
  if (actions & ACT_GRAB) {
    for (const loot of state.loots) {
      if (!loot.taken && Math.hypot(loot.x - thief.x, loot.y - thief.y) <= THIEF.grabRange + 14) {
        loot.taken = true;
        state.lootTaken += 1;
        state.score += LOOT_VALUES[loot.kind];
        sfx.grab();
        status.textContent = `${loot.name ?? loot.kind} lifted. Score ${state.score}.`;
        break;
      }
    }
    for (const pickup of state.pickups) {
      if (!pickup.taken && Math.hypot(pickup.x - thief.x, pickup.y - thief.y) <= THIEF.grabRange + 8) {
        pickup.taken = true;
        if (pickup.kind === 'emp') state.empCharges += 1;
        else state.smokeCharges += 1;
        sfx.pickup();
        break;
      }
    }
  }

  // --- the vault pushes back -------------------------------------------------
  const events = {};
  updateGuards(state, dt, events);
  updateCameras(state, dt, events);
  updateLasers(state, dt, events);
  if (events.spotted) sfx.spotted();
  if (events.laserTrip) sfx.laserTrip();
  const seen = events.spotted || events.cameraSpot;
  if (!seen && state.alarm > 0) state.alarm = Math.max(0, state.alarm - ALARM.decayPerSecond * dt);
  state.alarmPeak = Math.max(state.alarmPeak, state.alarm);
  if (state.alarm > 45) { // the alarm audibly ticks while it is high
    state.tickClock -= dt;
    if (state.tickClock <= 0) { sfx.alarmTick(); state.tickClock = 0.42; }
  }
  if (state.alarm >= ALARM.max) {
    state.screen = 'caught';
    sfx.caught();
    status.textContent = 'Caught! The alarm hit 100%.';
    return;
  }

  // --- the getaway -----------------------------------------------------------
  const e = state.def.exit;
  if (exitUnlocked(state)
    && thief.x > e.x - 6 && thief.x < e.x + e.w + 6
    && thief.y > e.y - 6 && thief.y < e.y + e.h + 6) {
    if (state.index + 1 < FLOORS.length) {
      sfx.floorClear();
      nextFloor(state);
      status.textContent = `${state.def.name}. ${state.def.objective}`;
    } else {
      if (state.alarmPeak <= 40) state.score += GHOST_BONUS;
      state.screen = 'win';
      sfx.win();
      status.textContent = `Clean getaway! Final score ${state.score}.`;
    }
  }
}

// --- boot -------------------------------------------------------------------
const params = new URLSearchParams(window.location.search);
const shotState = params.has('shot') ? stageShot(params.get('shot')) : null;

if (shotState) {
  window.__aurumState = shotState;
  drawFrame(shotState); // one frozen frame; the screenshot tools read the canvas
} else {
  let state = createRun();
  window.__aurumState = state; // playtest hook: lets the screenshot driver verify movement and grabs
  let last = performance.now();
  let accumulator = 0;
  const frame = (now) => {
    accumulator += Math.min(0.1, (now - last) / 1000);
    last = now;
    while (accumulator >= STEP) {
      stepGame(state, STEP);
      accumulator -= STEP;
    }
    drawFrame(state);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
