/** Seats and seams, pos advance, serveFrac / paceFrac / steadyFrac / care. */

import {
  CARE_MISS,
  CARE_SOFT,
  CARE_SPILL,
  CARE_TEA,
  GRAIN_GAIN,
  GRAIN_PERIOD,
  GRAIN_TILT_MUL,
  HARD_SPILL,
  PACE_TARGET,
  SCORE_CARE,
  SCORE_PACE,
  SCORE_SERVE,
  SCORE_STEADY,
  SERVE_GOOD_T,
  SOFT_SPILL,
  STOP_SPEED,
  TEA_LOSS,
  clamp,
  gradeForScore,
  paceInst,
  steadyInst,
} from "./constants.mjs";
import { advancePos, integrateSpeed, isStopped } from "./gait.mjs";
import { seamAt } from "./daily.mjs";
import { integrateSlosh, isServePose, seamImpulseOf, sloshMag, tiltMag } from "./tray.mjs";

export { paceInst, seamAt, steadyInst };

export function makeSeatProg(seats) {
  return (seats || []).map(() => ({ goodT: 0, served: false }));
}

export function inSeat(pos, seat) {
  if (!seat) return false;
  return pos >= seat.s0 - 1e-12 && pos <= seat.s1 + 1e-12;
}

export function seatsComplete(s) {
  if (!s || s.spilled) return false;
  const seats = s.params?.seats || [];
  const prog = s.seatProg || [];
  if (!seats.length || prog.length !== seats.length) return false;
  for (const p of prog) {
    if (!p.served) return false;
  }
  return true;
}

export function scoreParts(s) {
  const prog = s.seatProg || [];
  const n = prog.length;
  let serveFrac = 0;
  if (n === 0) {
    serveFrac = 0;
  } else {
    let sum = 0;
    for (const p of prog) {
      if (p.served) sum += 1;
      else sum += clamp((Number(p.goodT) || 0) / SERVE_GOOD_T, 0, 1);
    }
    serveFrac = sum / n;
  }
  const nPace = Number(s.nPace) || 0;
  const sumPace = Number(s.sumPace) || 0;
  const paceFrac = nPace > 1e-6 ? clamp(sumPace / nPace, 0, 1) : 0;
  const nSteady = Number(s.nSteady) || 0;
  const sumSteady = Number(s.sumSteady) || 0;
  const steadyFrac = nSteady > 1e-6 ? clamp(sumSteady / nSteady, 0, 1) : 0;
  const nSeats = Math.max(1, n || Number(s.seatsTotal) || 0);
  const careTerm =
    CARE_SOFT * clamp((Number(s.softSpills) || 0) / 2, 0, 1) +
    CARE_TEA * clamp(1 - (Number(s.tea) || 0), 0, 1) +
    CARE_SPILL * (s.spilled ? 1 : 0) +
    CARE_MISS * clamp((Number(s.missedSeats) || 0) / nSeats, 0, 1);
  const care = 1 - clamp(careTerm, 0, 1);
  const raw = 100 * (SCORE_SERVE * serveFrac + SCORE_PACE * paceFrac + SCORE_STEADY * steadyFrac + SCORE_CARE * care);
  const score = Math.round(clamp(raw, 0, 100));
  const grade = gradeForScore(score);
  return { serveFrac, paceFrac, steadyFrac, care, score, grade };
}

function markMissed(s, pos) {
  const seats = s.params?.seats || [];
  const prog = s.seatProg || [];
  let missed = 0;
  for (let i = 0; i < seats.length; i++) {
    if (pos > seats[i].s1 + 1e-12 && !prog[i]?.served) missed += 1;
  }
  s.missedSeats = missed;
}

/**
 * Advance corridor, slosh, spill, and scores for one physics step while playing.
 * Mutates s. Does not lock the score.
 */
export function stepPath(s, dt) {
  const step = Math.max(0, Number(dt) || 0);
  const prevSpeed = Number(s.left?.speed) || 0;
  const prevPos = Number(s.pos) || 0;
  const pathDur = Number(s.params?.pathDur) || 1;

  const speed = integrateSpeed(prevSpeed, s.left?.gait, step);
  s.left = { ...s.left, speed };
  const accel = step > 0 ? (speed - prevSpeed) / step : 0;
  s.pos = advancePos(prevPos, speed, pathDur, step);
  s.stopped = isStopped(speed);

  let impulse = 0;
  const seams = s.params?.seams || [];
  const hits = s._hitSeams ? s._hitSeams.slice() : seams.map(() => false);
  for (let i = 0; i < seams.length; i++) {
    const seam = seams[i];
    const inside = Math.abs(s.pos - seam.s) <= seam.w / 2 + 1e-12;
    const was = Math.abs(prevPos - seam.s) <= seam.w / 2 + 1e-12;
    if (inside && !was && !hits[i]) {
      hits[i] = true;
      // A step's jolt scales with walking speed (slow steps are gentle).
      const speedMul = clamp((Number(s.left?.speed) || 0) / PACE_TARGET, 0.2, 1.3);
      impulse += seamImpulseOf(seam.k, s.params?.floorMul) * speedMul;
    }
  }
  s._hitSeams = hits;
  s.seamHits = hits.reduce((n, h) => n + (h ? 1 : 0), 0);

  const tMag = tiltMag(s.right);
  const grainAmp = GRAIN_GAIN * (Number(s.params?.floorMul) || 1) * speed * (1 + GRAIN_TILT_MUL * tMag);
  let grain = grainAmp * Math.sin((2 * Math.PI * s.pos) / Math.max(1e-6, GRAIN_PERIOD));
  // Keep grain from instantly tipping the bowl; a sloppy tray still soft-spills.
  grain = clamp(grain, -3.2, 3.2);
  s.right = integrateSlosh(s.right, accel, impulse, step, grain);
  s.teaMag = sloshMag(s.right);

  if (!s.spilled) {
    if (s.teaMag > SOFT_SPILL + 1e-12) {
      if (!s._softOn) {
        s.softSpills = (Number(s.softSpills) || 0) + 1;
        s._softOn = true;
      }
      s.tea = clamp((Number(s.tea) || 0) - TEA_LOSS * step, 0, 1);
    } else {
      s._softOn = false;
    }
    if (s.teaMag >= HARD_SPILL - 1e-12) s.spilled = true;
  }

  if (s.finishedAt == null && !s.spilled) {
    if (speed > STOP_SPEED + 1e-12) {
      s.nPace = (Number(s.nPace) || 0) + step;
      s.sumPace = (Number(s.sumPace) || 0) + paceInst(speed) * step;
    }
    s.nSteady = (Number(s.nSteady) || 0) + step;
    s.sumSteady = (Number(s.sumSteady) || 0) + steadyInst(s.teaMag) * step;

    const seats = s.params?.seats || [];
    const prog = (s.seatProg || []).map((p) => ({ goodT: Number(p.goodT) || 0, served: !!p.served }));
    for (let i = 0; i < seats.length; i++) {
      if (!prog[i]) prog[i] = { goodT: 0, served: false };
      if (prog[i].served) continue;
      const canServe =
        s.stopped && inSeat(s.pos, seats[i]) && (Number(s.tea) || 0) > 1e-12 && isServePose(s.right);
      if (canServe) {
        prog[i].goodT += step;
        if (prog[i].goodT + 1e-12 >= SERVE_GOOD_T) prog[i].served = true;
      }
    }
    s.seatProg = prog;
    s.seatsServed = prog.reduce((n, p) => n + (p.served ? 1 : 0), 0);
    markMissed(s, s.pos);
  } else if (s.finishedAt == null && s.spilled) {
    markMissed(s, s.pos);
  }
}

void seamAt;
