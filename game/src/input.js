// Keyboard input for the thief. Held keys give a movement vector plus the
// sneak / sprint modifiers; one-shot presses (grab, smoke, EMP, confirm,
// restart) are queued as bit flags and consumed once by the loop, so a press
// between two frames is never lost and never counted twice.

export const ACT_GRAB = 1;
export const ACT_SMOKE = 2;
export const ACT_EMP = 4;
export const ACT_CONFIRM = 8;
export const ACT_RESTART = 16;

const GRAB = new Set(['KeyE']);
const SMOKE = new Set(['KeyQ']);
const EMP = new Set(['KeyF']);
const CONFIRM = new Set(['Enter', 'Space']);
const RESTART = new Set(['KeyR']);
const SNEAK = new Set(['KeyC', 'ControlLeft', 'ControlRight']);
const HANDLED = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyE', 'KeyQ', 'KeyF', 'KeyC', 'KeyR',
  'Enter', 'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
]);

export function createInput() {
  const held = new Set();
  let queued = 0;

  window.addEventListener('keydown', (event) => {
    if (!HANDLED.has(event.code)) return;
    event.preventDefault();
    held.add(event.code);
    if (event.repeat) return;
    if (GRAB.has(event.code)) queued |= ACT_GRAB;
    else if (SMOKE.has(event.code)) queued |= ACT_SMOKE;
    else if (EMP.has(event.code)) queued |= ACT_EMP;
    else if (CONFIRM.has(event.code)) queued |= ACT_CONFIRM;
    else if (RESTART.has(event.code)) queued |= ACT_RESTART;
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => held.clear());

  const down = (...codes) => codes.some((c) => held.has(c));

  return {
    /** Movement intent: x/y in -1..1 (not normalised; the world normalises). */
    moveVector() {
      return {
        x: (down('ArrowRight', 'KeyD') ? 1 : 0) - (down('ArrowLeft', 'KeyA') ? 1 : 0),
        y: (down('ArrowDown', 'KeyS') ? 1 : 0) - (down('ArrowUp', 'KeyW') ? 1 : 0),
      };
    },
    sneaking() { return [...SNEAK].some((c) => held.has(c)); },
    sprinting() { return down('ShiftLeft', 'ShiftRight'); },
    /** Returns the queued one-shot actions and clears the queue. */
    takeActions() {
      const actions = queued;
      queued = 0;
      return actions;
    },
  };
}
