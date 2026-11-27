/** Positions → tilt, slosh, teaMag. Checkable pure functions. */

import {
  ACCEL_GAIN,
  LEVEL_RAD,
  SEAM_GAIN,
  SERVE_SLOSH,
  SERVE_TILT_X0,
  SERVE_TILT_X1,
  SERVE_TILT_Y,
  SLOSH_DAMP,
  SLOSH_SPRING,
  TILT_R,
  TILT_RATE_GAIN,
  TRAY_CX,
  TRAY_CY,
  TRAY_TAU,
  clamp,
} from "./constants.mjs";

export function emptyRight() {
  return {
    tiltX: 0,
    tiltY: 0,
    sloshX: 0,
    sloshY: 0,
    sloshVX: 0,
    sloshVY: 0,
    tiltDesX: 0,
    tiltDesY: 0,
    _prevTiltX: 0,
    _prevTiltY: 0,
  };
}

/**
 * Desired tray tilt from a right-hand sample.
 * Inside the 36wu neutral circle the target is level. Outside, the excess radius
 * is scaled so the edge of the circle is 0 and TILT_R is magnitude 1.
 */
export function tiltDesired(x, y) {
  const dx = Number(x) - TRAY_CX;
  const dy = Number(y) - TRAY_CY;
  const r = Math.hypot(dx, dy);
  if (!(r > LEVEL_RAD + 1e-12)) return { tiltX: 0, tiltY: 0 };
  const span = Math.max(1e-9, TILT_R - LEVEL_RAD);
  const mag = clamp((r - LEVEL_RAD) / span, 0, 1);
  return { tiltX: (dx / r) * mag, tiltY: (dy / r) * mag };
}

/**
 * Update tilt from a right-hand sample.
 * When inactive or not landscape, tilt stays (no snap back). Slosh is integrated
 * by the caller during play.
 */
export function updateTray(right, pos, dt, active) {
  const next = {
    tiltX: Number(right?.tiltX) || 0,
    tiltY: Number(right?.tiltY) || 0,
    sloshX: Number(right?.sloshX) || 0,
    sloshY: Number(right?.sloshY) || 0,
    sloshVX: Number(right?.sloshVX) || 0,
    sloshVY: Number(right?.sloshVY) || 0,
    tiltDesX: Number(right?.tiltDesX) || 0,
    tiltDesY: Number(right?.tiltDesY) || 0,
  };
  const step = Math.max(0, Number(dt) || 0);
  if (!active || !pos) {
    next.tiltDesX = next.tiltX;
    next.tiltDesY = next.tiltY;
    return next;
  }
  const des = tiltDesired(pos.x, pos.y);
  next.tiltDesX = des.tiltX;
  next.tiltDesY = des.tiltY;
  const prevX = next.tiltX;
  const prevY = next.tiltY;
  if (step > 0) {
    const k = 1 - Math.exp(-step / TRAY_TAU);
    next.tiltX += (des.tiltX - next.tiltX) * k;
    next.tiltY += (des.tiltY - next.tiltY) * k;
  }
  next._prevTiltX = prevX;
  next._prevTiltY = prevY;
  return next;
}

/**
 * Integrate slosh spring. Call only during play in landscape.
 * slosh'' = -SPRING * slosh - DAMP * slosh' + ACCEL_GAIN * accel + seam impulse.
 * slosh is the tea's wobble relative to the tray, so a held tilt settles to
 * teaMag → 0 (otherwise a serve pose with tiltX 0.22–0.55 could not also keep
 * slosh ≤ 0.28). `accel` is d(speed)/dt and feeds sloshX (along the corridor).
 * A seam impulse is a one-shot addition to sloshX velocity of k * SEAM_GAIN * floorMul.
 * Uses semi-implicit Euler, stable at 1/60.
 */
export function integrateSlosh(right, accel, seamImpulse, dt, grainForce = 0) {
  const next = {
    tiltX: Number(right?.tiltX) || 0,
    tiltY: Number(right?.tiltY) || 0,
    sloshX: Number(right?.sloshX) || 0,
    sloshY: Number(right?.sloshY) || 0,
    sloshVX: Number(right?.sloshVX) || 0,
    sloshVY: Number(right?.sloshVY) || 0,
    tiltDesX: Number(right?.tiltDesX) || 0,
    tiltDesY: Number(right?.tiltDesY) || 0,
  };
  const step = Math.max(0, Number(dt) || 0);
  next.sloshVX += Number(seamImpulse) || 0;
  if (step > 0) {
    const ptx = Number(right?.tiltX) || 0; // tilt already written on next; use previous from arg
    const pty = Number(right?._prevTiltY) || next.tiltY;
    const prevX = Number(right?._prevTiltX);
    const prevY = Number(right?._prevTiltY);
    const tiltVelX = Number.isFinite(prevX) ? (next.tiltX - prevX) / step : 0;
    const tiltVelY = Number.isFinite(prevY) ? (next.tiltY - prevY) / step : 0;
    // Clamp the tilt-rate force so a fast swipe soft-spills but does not instantly tip the bowl.
    const rateX = clamp(TILT_RATE_GAIN * tiltVelX, -5.2, 5.2);
    const rateY = clamp(TILT_RATE_GAIN * tiltVelY, -5.2, 5.2);
    const ax = -SLOSH_SPRING * next.sloshX - SLOSH_DAMP * next.sloshVX + ACCEL_GAIN * (Number(accel) || 0) + rateX + (Number(grainForce) || 0);
    const ay = -SLOSH_SPRING * next.sloshY - SLOSH_DAMP * next.sloshVY + rateY;
    next.sloshVX += ax * step;
    next.sloshVY += ay * step;
    next.sloshX += next.sloshVX * step;
    next.sloshY += next.sloshVY * step;
  }
  next._prevTiltX = next.tiltX;
  next._prevTiltY = next.tiltY;
  return next;
}

export function sloshMag(right) {
  return Math.hypot(Number(right?.sloshX) || 0, Number(right?.sloshY) || 0);
}

export function tiltMag(right) {
  return Math.hypot(Number(right?.tiltX) || 0, Number(right?.tiltY) || 0);
}

export function seamImpulseOf(k, floorMul) {
  return (Number(k) || 0) * SEAM_GAIN * (Number(floorMul) || 1);
}

export function isServePose(right) {
  const tx = Number(right?.tiltX) || 0;
  const ty = Number(right?.tiltY) || 0;
  const mag = sloshMag(right);
  return tx >= SERVE_TILT_X0 - 1e-12 && tx <= SERVE_TILT_X1 + 1e-12 && Math.abs(ty) <= SERVE_TILT_Y + 1e-12 && mag <= SERVE_SLOSH + 1e-12;
}

export function pointOnTray(tiltX, tiltY) {
  const mx = clamp(Number(tiltX) || 0, -1, 1);
  const my = clamp(Number(tiltY) || 0, -1, 1);
  const mag = Math.hypot(mx, my);
  if (mag < 1e-9) return { x: TRAY_CX, y: TRAY_CY };
  const r = LEVEL_RAD + mag * (TILT_R - LEVEL_RAD);
  return { x: TRAY_CX + (mx / mag) * r, y: TRAY_CY + (my / mag) * r };
}
