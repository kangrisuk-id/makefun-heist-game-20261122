// AURUM VAULT — every tuning number and all three floor layouts in one place.
// The vault is a fixed 1088x832 logical playfield; the renderer scales it to
// the window, so no rule below depends on the screen size.

export const FIELD = { width: 1088, height: 832 };
export const STEP = 1 / 60;

export const THIEF = {
  radius: 13,
  walkSpeed: 182,
  sneakSpeed: 94,
  sprintSpeed: 272,
  grabRange: 42,
};

export const GUARD = {
  radius: 14,
  patrolSpeed: 64,
  coneRange: 196,
  coneHalfAngle: 0.56, // radians, ~32 degrees
  turnSpeed: 2.6,
  pauseAtWaypoint: 0.7,
};

export const CAMERA = {
  coneRange: 178,
  coneHalfAngle: 0.42,
  sweepSpeed: 0.55,
  empDisableSeconds: 6,
};

export const ALARM = {
  max: 100,
  guardFillPerSecond: 40,   // scaled by distance and the thief's stance
  cameraFillPerSecond: 62,
  laserSpike: 30,
  decayPerSecond: 7,
};

export const TOOLS = { smokeSeconds: 3, smokeChargesStart: 1, empChargesStart: 1 };

export const LOOT_VALUES = { diamond: 500, gold: 350, crown: 450, painting: 400, gem: 60 };
export const GHOST_BONUS = 750;   // paid when the alarm peak stayed at or under GHOST_ALARM_CAP
export const GHOST_ALARM_CAP = 40;

// A rect is solid cover: it blocks movement and sight. kind picks the drawing:
// 'wall' marble block, 'case' glass display case, 'pillar' a column (drawn
// round, collides as its bounding square).
const W = (x, y, w, h, kind = 'wall') => ({ x, y, w, h, kind });

export const FLOORS = [
  {
    name: 'Floor 1 — Lobby of Ledgers',
    objective: 'Lift the diamond and the gold bars, then slip out the EXIT.',
    carpet: [[70, 700, 948, 62], [494, 96, 100, 666]],
    cover: [
      W(300, 176, 150, 54, 'case'), W(638, 176, 150, 54, 'case'),
      W(300, 556, 150, 54, 'case'), W(638, 556, 150, 54, 'case'),
      W(520, 300, 48, 48, 'pillar'), W(520, 486, 48, 48, 'pillar'),
      W(140, 330, 210, 22), W(738, 330, 210, 22),
      W(140, 470, 210, 22), W(738, 470, 210, 22),
    ],
    spawn: { x: 92, y: 726 },
    exit: { x: 1004, y: 66, w: 56, h: 74 },
    guards: [
      { waypoints: [[236, 128], [852, 128]] },
      { waypoints: [[852, 668], [236, 668]] },
    ],
    cameras: [
      { x: 40, y: 416, baseAngle: 0, sweep: 0.75 },
    ],
    lasers: [
      { x1: 474, y1: 412, x2: 614, y2: 412, period: 3.4, onTime: 2.6, phase: 0 },
    ],
    loots: [
      { kind: 'diamond', x: 375, y: 203, required: true },
      { kind: 'gold', x: 713, y: 203, required: true },
      { kind: 'gem', x: 375, y: 583 },
      { kind: 'gem', x: 713, y: 583 },
      { kind: 'gem', x: 544, y: 128 },
    ],
    pickups: [
      { kind: 'smoke', x: 92, y: 128 },
      { kind: 'emp', x: 996, y: 726 },
    ],
    lamps: [[200, 130], [888, 130], [200, 700], [888, 700], [544, 416]],
  },
  {
    name: 'Floor 2 — Gallery of Crowns',
    objective: 'Take the crown, the painting and the gold. Mind the second camera.',
    carpet: [[70, 700, 948, 62], [70, 96, 62, 666], [956, 96, 62, 666]],
    cover: [
      W(240, 150, 22, 200), W(826, 150, 22, 200),
      W(240, 482, 22, 200), W(826, 482, 22, 200),
      W(404, 250, 130, 50, 'case'), W(554, 250, 130, 50, 'case'),
      W(404, 540, 130, 50, 'case'), W(554, 540, 130, 50, 'case'),
      W(520, 392, 48, 48, 'pillar'),
      W(370, 392, 110, 20), W(608, 392, 110, 20),
    ],
    spawn: { x: 92, y: 726 },
    exit: { x: 1004, y: 66, w: 56, h: 74 },
    guards: [
      { waypoints: [[330, 128], [758, 128], [758, 300], [330, 300]] },
      { waypoints: [[758, 690], [330, 690], [330, 520], [758, 520]] },
      { waypoints: [[544, 620], [544, 210]] },
    ],
    cameras: [
      { x: 40, y: 120, baseAngle: 0.5, sweep: 0.7 },
      { x: 1048, y: 712, baseAngle: -2.2, sweep: 0.7 },
    ],
    lasers: [
      { x1: 262, y1: 416, x2: 404, y2: 416, period: 3.0, onTime: 1.8, phase: 0.6 },
      { x1: 684, y1: 416, x2: 826, y2: 416, period: 3.0, onTime: 1.8, phase: 1.9 },
    ],
    loots: [
      { kind: 'crown', x: 469, y: 275, required: true },
      { kind: 'painting', x: 619, y: 275, required: true },
      { kind: 'gold', x: 544, y: 565, required: true },
      { kind: 'gem', x: 160, y: 416 },
      { kind: 'gem', x: 928, y: 416 },
      { kind: 'gem', x: 469, y: 565 },
      { kind: 'gem', x: 619, y: 565 },
    ],
    pickups: [
      { kind: 'emp', x: 92, y: 128 },
      { kind: 'smoke', x: 996, y: 128 },
    ],
    lamps: [[160, 130], [928, 130], [160, 700], [928, 700], [544, 130], [544, 700]],
  },
  {
    name: 'Floor 3 — The Aurum Vault',
    objective: 'Crack the vault: the Aurum Heart, the crown and the gold, then escape!',
    carpet: [[70, 700, 948, 62], [494, 96, 100, 666]],
    cover: [
      W(180, 180, 200, 22), W(708, 180, 200, 22),
      W(180, 620, 200, 22), W(708, 620, 200, 22),
      W(300, 300, 130, 50, 'case'), W(658, 300, 130, 50, 'case'),
      W(300, 486, 130, 50, 'case'), W(658, 486, 130, 50, 'case'),
      W(520, 392, 48, 48, 'pillar'),
      W(466, 180, 156, 40, 'case'),
    ],
    spawn: { x: 92, y: 726 },
    exit: { x: 996, y: 356, w: 64, h: 120 },
    guards: [
      { waypoints: [[200, 120], [888, 120]] },
      { waypoints: [[888, 712], [200, 712]] },
      { waypoints: [[150, 416], [470, 416]] },
      { waypoints: [[938, 416], [618, 416]] },
    ],
    cameras: [
      { x: 40, y: 200, baseAngle: 0.35, sweep: 0.75 },
      { x: 1048, y: 632, baseAngle: Math.PI - 0.35, sweep: 0.75 },
    ],
    lasers: [
      { x1: 474, y1: 300, x2: 614, y2: 300, period: 2.8, onTime: 1.7, phase: 0 },
      { x1: 474, y1: 532, x2: 614, y2: 532, period: 2.8, onTime: 1.7, phase: 1.2 },
      { x1: 544, y1: 612, x2: 544, y2: 720, period: 3.2, onTime: 2.0, phase: 0.5 },
    ],
    loots: [
      { kind: 'diamond', x: 544, y: 200, required: true, name: 'Aurum Heart' },
      { kind: 'crown', x: 365, y: 325, required: true },
      { kind: 'gold', x: 723, y: 511, required: true },
      { kind: 'gem', x: 723, y: 325 },
      { kind: 'gem', x: 365, y: 511 },
      { kind: 'gem', x: 130, y: 250 },
      { kind: 'gem', x: 958, y: 582 },
    ],
    pickups: [
      { kind: 'emp', x: 92, y: 128 },
      { kind: 'smoke', x: 996, y: 128 },
      { kind: 'emp', x: 92, y: 560 },
    ],
    lamps: [[200, 130], [888, 130], [200, 700], [888, 700], [544, 416], [130, 416], [958, 416]],
  },
];
