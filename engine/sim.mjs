/** tick(state, input, dt) → state. Place, play, reveal, finish. No DOM. */

import {
  DAILY_HINT_TIME,
  FINISH_MIN,
  FIXED_DT,
  LESSON_HINT_TIME,
  MAX_DT,
  PLACE_TIME,
  PLAY_TIME,
  REVEAL_TIME,
  SPILL_REVEAL_DELAY,
  START_POS,
  START_TEA,
} from "./constants.mjs";
import { dailyParams } from "./daily.mjs";
import { emptyLeft, updateGait } from "./gait.mjs";
import { makeSeatProg, scoreParts, seatsComplete, stepPath } from "./path.mjs";
import { hashSeed } from "./rng.mjs";
import { emptyRight, sloshMag, tiltMag, updateTray } from "./tray.mjs";

export { scoreParts, seatsComplete };

export function previewScore(s) {
  if (!s) return 0;
  return scoreParts(s).score;
}

function cloneState(s) {
  return {
    ...s,
    params: s.params
      ? {
          ...s.params,
          seats: (s.params.seats || []).map((t) => ({ ...t })),
          seams: (s.params.seams || []).map((c) => ({ ...c })),
        }
      : s.params,
    left: { ...(s.left || emptyLeft()) },
    right: { ...(s.right || emptyRight()) },
    seatProg: (s.seatProg || []).map((p) => ({ goodT: Number(p.goodT) || 0, served: !!p.served })),
    _hitSeams: s._hitSeams ? s._hitSeams.slice() : s._hitSeams,
  };
}

function hands(input) {
  const leftOn = !!input?.left?.active;
  const rightOn = !!input?.right?.active;
  return {
    leftOn,
    rightOn,
    leftPos: leftOn ? { x: Number(input.left.x), y: Number(input.left.y) } : null,
    rightPos: rightOn ? { x: Number(input.right.x), y: Number(input.right.y) } : null,
  };
}

function updateBests(s) {
  if (s.score <= 0) return;
  if (s.score > s.bestScore) s.bestScore = s.score;
  if (s.score > s.todayBestScore) s.todayBestScore = s.score;
}

function refreshLive(s) {
  const parts = scoreParts(s);
  if (s.finishedAt == null) {
    s.serveFrac = parts.serveFrac;
    s.paceFrac = parts.paceFrac;
    s.steadyFrac = parts.steadyFrac;
    s.care = parts.care;
  }
}

function lockScore(s) {
  if (s.finishedAt != null) return;
  const parts = scoreParts(s);
  s.serveFrac = parts.serveFrac;
  s.paceFrac = parts.paceFrac;
  s.steadyFrac = parts.steadyFrac;
  s.care = parts.care;
  s.score = parts.score;
  s.grade = parts.grade;
  s.finishedAt = s.playT;
  s.showDaily = false;
  s.showLesson = false;
  updateBests(s);
}

function goReveal(s) {
  s.phase = "reveal";
  s.phaseT = 0;
  s.showDaily = false;
  s.showLesson = false;
}

export function canFinish(s) {
  if (!s || s.status !== "playing" || s.phase !== "play") return false;
  if (s.finishedAt != null) return false;
  if (seatsComplete(s)) return true;
  return s.playT + 1e-9 >= FINISH_MIN;
}

function finalizeFinish(s) {
  lockScore(s);
  goReveal(s);
}

function applyGestures(s, input, dt, active) {
  const h = hands(input);
  const leftPos = active && h.leftOn ? h.leftPos : null;
  const rightPos = active && h.rightOn ? h.rightPos : null;
  const prevGait = s.left.gait;
  const prevTilt = tiltMag(s.right);
  const keepSpeed = s.left.speed;
  s.left = updateGait(s.left, leftPos, dt, !!(active && h.leftOn));
  // Speed is integrated in stepPath during play; keep it here so portrait / place freeze it.
  s.left.speed = keepSpeed;
  s.right = updateTray(s.right, rightPos, dt, !!(active && h.rightOn));
  s.teaMag = sloshMag(s.right);

  if (active && h.leftOn && Math.abs(s.left.gait - prevGait) > 0.04) {
    s.hintLeft = false;
  }
  if (active && h.rightOn && Math.abs(tiltMag(s.right) - prevTilt) > 0.04) {
    s.hintRight = false;
  }
}

function stepPlay(s, input, dt) {
  if (s.finishedAt != null) {
    s.playT += dt;
    s.phaseT += dt;
    s.showDaily = false;
    s.showLesson = false;
    if (s.spilled) {
      s.endWait = (Number(s.endWait) || 0) + dt;
      // Visuals only: keep walking / slosh moving, but do not add to the score.
      stepPath(s, dt);
      if (s.endWait + 1e-9 >= SPILL_REVEAL_DELAY) goReveal(s);
    }
    return;
  }

  stepPath(s, dt);
  refreshLive(s);

  s.playT += dt;
  s.phaseT += dt;
  s.showDaily = s.playT < DAILY_HINT_TIME;
  s.showLesson = s.playT < LESSON_HINT_TIME;

  if (s.spilled) {
    lockScore(s);
    s.endWait = 0;
    return;
  }
  if (seatsComplete(s)) {
    s.playT = Math.min(s.playT, PLAY_TIME);
    finalizeFinish(s);
  } else if (s.playT + 1e-9 >= PLAY_TIME) {
    s.playT = PLAY_TIME;
    finalizeFinish(s);
  } else if (input?.finish && canFinish(s)) {
    finalizeFinish(s);
  }
}

function stepPhase(s, input, dt) {
  if (s.status !== "playing") return;
  if (s.phase === "place") {
    s.phaseT += dt;
    // Start pose is held through the place beat: gait, speed, tilt, slosh, tea, pos.
    s.left = { ...s.left, gait: 0, speed: 0, gaitDes: 0 };
    s.right = emptyRight();
    s.pos = START_POS;
    s.stopped = true;
    s.tea = START_TEA;
    s.teaMag = 0;
    if (s.phaseT + 1e-9 >= PLACE_TIME) {
      const overflow = Math.max(0, s.phaseT - PLACE_TIME);
      s.phase = "play";
      s.phaseT = 0;
      s.playT = 0;
      s.showDaily = true;
      s.showLesson = true;
      if (overflow > 0) stepPlay(s, input, overflow);
    }
    return;
  }
  if (s.phase === "play") {
    stepPlay(s, input, dt);
    return;
  }
  if (s.phase === "reveal") {
    s.phaseT += dt;
    if (s.phaseT + 1e-9 >= REVEAL_TIME) s.status = "over";
  }
}

/**
 * Near-pure: same state+input+dt → same result. Does not mutate state or input.
 * Clamps dt to 50ms and steps play / phases at 1/60 + remainder.
 * Gestures are applied once per call with the frame dt (positions are samples, not per-substep).
 * When landscape is false, walk / tilt / serve / finish are ignored and time does not advance;
 * gait decays, tilt stays, and body inertia (speed / slosh) is frozen.
 */
export function tick(state, input, dt) {
  if (state.status !== "playing") return cloneState(state);
  const s = cloneState(state);
  const rawDt = Math.min(Math.max(Number(dt) || 0, 0), MAX_DT);
  if (!input?.landscape) {
    applyGestures(s, input, rawDt, false);
    s.left.speed = Number(state.left?.speed) || 0;
    s.right = {
      ...s.right,
      sloshX: Number(state.right?.sloshX) || 0,
      sloshY: Number(state.right?.sloshY) || 0,
      sloshVX: Number(state.right?.sloshVX) || 0,
      sloshVY: Number(state.right?.sloshVY) || 0,
    };
    s.teaMag = sloshMag(s.right);
    return s;
  }
  applyGestures(s, input, rawDt, s.phase === "play");
  let left = rawDt;
  while (left > 0 && s.status === "playing") {
    const stepDt = Math.min(FIXED_DT, left);
    stepPhase(s, input, stepDt);
    left -= stepDt;
  }
  return s;
}

/**
 * Shared by 「仕舞う」, the time limit, and a completed set of seats.
 * No-op before 22s unless all seats are served, and during place / reveal / when not playing.
 * Landscape is enforced by tick; a direct call assumes the caller already checked orientation.
 * A spill is locked by tick, not by finishNow.
 */
export function finishNow(state) {
  const s = cloneState(state);
  if (canFinish(s)) finalizeFinish(s);
  return s;
}

/** Fresh playing state. bestScore / todayBestScore are in-memory; persist elsewhere. */
export function createInitialState({ seed, dateJst, bestScore = 0, todayBestScore = 0 } = {}) {
  const rng0 = hashSeed(seed);
  const built = dailyParams(rng0);
  const params = built.params;
  const seats = params.seats || [];
  return {
    status: "playing",
    phase: "place",
    seed,
    dateJst: dateJst ?? null,
    phaseT: 0,
    playT: 0,
    rngState: built.rngState,
    params,
    left: emptyLeft(),
    right: emptyRight(),
    pos: START_POS,
    stopped: true,
    spilled: false,
    tea: START_TEA,
    teaMag: 0,
    softSpills: 0,
    missedSeats: 0,
    seatsServed: 0,
    seatsTotal: seats.length,
    seatProg: makeSeatProg(seats),
    serveFrac: 0,
    paceFrac: 0,
    steadyFrac: 0,
    care: 1,
    nPace: 0,
    sumPace: 0,
    nSteady: 0,
    sumSteady: 0,
    score: 0,
    grade: null,
    finishedAt: null,
    bestScore: bestScore || 0,
    todayBestScore: todayBestScore || 0,
    hintLeft: true,
    hintRight: true,
    showDaily: false,
    showLesson: false,
    endWait: 0,
    seamHits: 0,
    _hitSeams: (params.seams || []).map(() => false),
    _softOn: false,
  };
}
