// AURUM VAULT — The Gilded Heist: the hand-in program for the make.fun
// "Make the best heist game" bounty (Node 22, standard library only).
//
// The game itself is the game/ folder next to this file: plain static files
// (index.html plus ES modules under game/src/) that a desktop browser plays
// offline, with no build step and no network request. My job here is only to
// deliver it: copy game/ and screenshots/ into the output directory and write
// dossier.json there with the vendored make.fun library, exactly as the
// scorer expects. Before copying I run my own sanity check over the bundle
// (entry point present, screenshots present and within the size cap), so a
// broken hand-in fails loudly here instead of silently at the gate.
//
// Try it locally:  node serve.ts          -> http://localhost:8080
// Hand it in:      mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// (Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output.)

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const SCREENSHOT_CAP = 262144; // the scorer's per-screenshot cap, 256 KiB

/** My own pre-flight check: refuse to hand in a bundle that cannot score. */
function checkBundleBeforeCopy(root: string): string[] {
  const problems: string[] = [];
  if (!existsSync(join(root, 'game', 'index.html'))) {
    problems.push('game/index.html is missing — the browser would have nothing to open');
  }
  const shotsDir = join(root, 'screenshots');
  const shots = existsSync(shotsDir)
    ? readdirSync(shotsDir).filter((name) => /\.(png|jpe?g)$/i.test(name))
    : [];
  if (shots.length < 3 || shots.length > 4) {
    problems.push(`screenshots/ holds ${shots.length} images — the gate wants 3 or 4`);
  }
  for (const name of shots) {
    const bytes = statSync(join(shotsDir, name)).size;
    if (bytes > SCREENSHOT_CAP) problems.push(`screenshots/${name} is ${bytes} bytes, over the ${SCREENSHOT_CAP} cap`);
  }
  return problems;
}

const problems = checkBundleBeforeCopy(here);
if (problems.length > 0) {
  for (const problem of problems) console.error(`bundle check: ${problem}`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

// A hand-in summary in my own words, so the run log says what was delivered.
const shotCount = readdirSync(join(out, 'screenshots')).length;
console.log(`AURUM VAULT handed in: game/ copied, ${shotCount} screenshots, dossier.json written to ${out}`);
