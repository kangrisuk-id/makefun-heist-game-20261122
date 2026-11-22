// A tiny WebAudio synth: every sound is an oscillator blip shaped by hand, so
// the game needs no audio files. The context is created lazily on the first
// user gesture (browser policy) and every call is a no-op until then.

let ctx = null;

export function unlockAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch {
    ctx = null;
  }
}

function tone(freqFrom, freqTo, seconds, type = 'square', volume = 0.08, delay = 0) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqFrom, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqTo), t0 + seconds);
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + seconds + 0.02);
}

export const sfx = {
  grab() { tone(880, 1320, 0.09, 'sine', 0.10); tone(1320, 1760, 0.12, 'sine', 0.08, 0.07); },
  pickup() { tone(520, 780, 0.08, 'triangle', 0.09); },
  smoke() { tone(300, 90, 0.28, 'sawtooth', 0.03); },
  emp() { tone(1400, 120, 0.3, 'sawtooth', 0.07); tone(90, 60, 0.34, 'square', 0.05, 0.02); },
  laserTrip() { tone(1200, 1200, 0.06, 'square', 0.09); tone(1200, 1200, 0.06, 'square', 0.09, 0.1); },
  alarmTick() { tone(1560, 1560, 0.045, 'square', 0.045); },
  spotted() { tone(660, 660, 0.09, 'square', 0.08); tone(660, 660, 0.09, 'square', 0.08, 0.12); },
  caught() { tone(392, 392, 0.16, 'sawtooth', 0.09); tone(311, 311, 0.16, 'sawtooth', 0.09, 0.16); tone(233, 110, 0.42, 'sawtooth', 0.1, 0.32); },
  floorClear() { tone(523, 523, 0.1, 'triangle', 0.09); tone(659, 659, 0.1, 'triangle', 0.09, 0.1); tone(784, 784, 0.16, 'triangle', 0.09, 0.2); },
  win() { tone(523, 523, 0.11, 'triangle', 0.09); tone(659, 659, 0.11, 'triangle', 0.09, 0.11); tone(784, 784, 0.11, 'triangle', 0.09, 0.22); tone(1046, 1046, 0.3, 'triangle', 0.1, 0.33); },
};
