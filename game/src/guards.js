// Guards: waypoint patrols and eyes. Each guard walks its loop, pauses at
// each waypoint, and turns smoothly toward its heading. Seeing the thief
// (inside the raycast vision cone, not hidden by smoke) raises that guard's
// alert and feeds the shared alarm meter.

import { ALARM, GUARD } from './config.js';
import { angleDiff, angleLerp, moveCircle, pointInCone } from './world.js';

export function updateGuards(state, dt, events) {
  const thief = state.thief;
  for (const g of state.guards) {
    if (g.pause > 0) {
      g.pause -= dt;
    } else {
      const [tx, ty] = g.waypoints[g.target];
      const dx = tx - g.x;
      const dy = ty - g.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 6) {
        g.target = (g.target + 1) % g.waypoints.length;
        g.pause = GUARD.pauseAtWaypoint;
      } else {
        const step = Math.min(dist, GUARD.patrolSpeed * dt);
        moveCircle(g, GUARD.radius, (dx / dist) * step, (dy / dist) * step, state.solids);
        const heading = Math.atan2(dy, dx);
        g.facing = angleLerp(g.facing, heading, Math.min(1, GUARD.turnSpeed * dt));
      }
    }

    // Eyes: smoke hides the thief from guards (never from cameras).
    let seen = 0;
    if (state.smokeTime <= 0) {
      seen = pointInCone(g.x, g.y, g.facing, GUARD.coneHalfAngle, GUARD.coneRange, thief.x, thief.y, state.solids);
    }
    if (seen > 0) {
      const stance = thief.sneaking ? 0.45 : thief.sprinting ? 1.35 : 1;
      const fill = ALARM.guardFillPerSecond * (0.35 + 0.65 * seen) * stance;
      state.alarm = Math.min(ALARM.max, state.alarm + fill * dt);
      if (g.alert < 1) events.spotted = true;
      g.alert = 1;
    } else {
      g.alert = Math.max(0, g.alert - dt * 0.8);
    }
    g.seenNow = seen > 0;
  }
}

/** The guard whose alert is highest (drives the "!" marker and cone colour). */
export function hottestGuard(state) {
  let best = null;
  for (const g of state.guards) if (!best || g.alert > best.alert) best = g;
  return best;
}
