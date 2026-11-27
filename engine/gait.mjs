/** Positions → gait, speed. Checkable pure functions. */

import {
  GAIT_RELEASE,
  GAIT_TAU,
  GAIT_Y0,
  LEVER_CX,
  LEVER_CY,
  SPEED_GAIN,
  SPEED_TAU,
  START_POS,
  STOP_SPEED,
  TAP_HOLD,
  TAP_PATH,
  clamp,
  gaitDesired,
  pointOnLever,
  yFromGait,
} from "./constants.mjs";

export { gaitDesired, pointOnLever, yFromGait };

export function emptyLeft() {
  return {
    gait: 0,
    speed: 0,
    gaitDes: 0,
    path: 0,
    holdT: 0,
    px: LEVER_CX,
    py: GAIT_Y0,
    hasPrev: false,
  };
}

/**
 * Update gait from a left-hand sample.
 * When inactive or not landscape, gait decays with GAIT_RELEASE (spring return).
 * A short tap (path < 10wu and hold under TAP_HOLD) does not start walking.
 * Holding still on the groove for a long contact does set gait (position, not a crank).
 */
export function updateGait(left, pos, dt, active) {
  const next = {
    gait: clamp(Number(left?.gait) || 0, 0, 1),
    speed: Math.max(0, Number(left?.speed) || 0),
    gaitDes: clamp(Number(left?.gaitDes) || 0, 0, 1),
    path: Number(left?.path) || 0,
    holdT: Number(left?.holdT) || 0,
    px: Number(left?.px) || LEVER_CX,
    py: Number(left?.py) || LEVER_CY,
    hasPrev: !!left?.hasPrev,
  };
  const step = Math.max(0, Number(dt) || 0);

  if (!active || !pos) {
    if (step > 0) next.gait *= Math.exp(-step / GAIT_RELEASE);
    if (next.gait < 1e-4) next.gait = 0;
    next.gaitDes = 0;
    next.hasPrev = false;
    next.path = 0;
    next.holdT = 0;
    return next;
  }

  if (next.hasPrev) next.path += Math.hypot(Number(pos.x) - next.px, Number(pos.y) - next.py);
  next.holdT += step;
  next.px = Number(pos.x);
  next.py = Number(pos.y);
  next.hasPrev = true;

  let des = gaitDesired(pos.y);
  if (next.path < TAP_PATH && next.holdT < TAP_HOLD) des = 0;
  next.gaitDes = des;
  if (step > 0) {
    next.gait += (des - next.gait) * (1 - Math.exp(-step / GAIT_TAU));
    next.gait = clamp(next.gait, 0, 1);
  }
  return next;
}

/**
 * Integrate walking speed from gait. Call only during play in landscape.
 * Target is gait * SPEED_GAIN. Body inertia remains after the finger is released.
 */
export function integrateSpeed(speed, gait, dt) {
  const step = Math.max(0, Number(dt) || 0);
  let v = Math.max(0, Number(speed) || 0);
  const target = clamp(Number(gait) || 0, 0, 1) * SPEED_GAIN;
  if (step > 0) v += (target - v) * (1 - Math.exp(-step / SPEED_TAU));
  if (v < 1e-5) v = 0;
  return v;
}

export function isStopped(speed) {
  return (Number(speed) || 0) <= STOP_SPEED + 1e-12;
}

export function advancePos(pos, speed, pathDur, dt) {
  const dur = Number(pathDur) || 0;
  const step = Math.max(0, Number(dt) || 0);
  let p = Number(pos);
  if (!Number.isFinite(p)) p = START_POS;
  if (dur > 0 && step > 0) p += (Number(speed) || 0) * step / dur;
  return clamp(p, 0, 1);
}
