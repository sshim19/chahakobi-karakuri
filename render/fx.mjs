/**
 * 重ねの開示、吹き出し、こぼれ、倒れ。
 * エンジンは触らず、state の差分から演出を進める。
 */

import * as constants from "../engine/constants.mjs";
import { isServePose, tiltMag } from "../engine/tray.mjs";
import { dailyCondition, formatScore, gradeCallout } from "./share.mjs";

export const JUDGE_BALLOON_OFFSET = constants.JUDGE_BALLOON_OFFSET ?? 70;
export const TRAIL_CAP = 280;
export const BITS_CAP = 16;
export const END_WARN = 0.8;
export const SEAT_WARN = 0.8;
// Design status lines use the original band edges (0.93 / 0.57), not the retuned scoring band.
export const FAST_SPEED = 0.93;
export const SLOW_SPEED = 0.57;
export const STOP_SPEED = constants.STOP_SPEED ?? 0.08;
export const STEADY_INNER = constants.STEADY_INNER ?? 0.22;
export const SLOSH_WARN = constants.STEADY_OUTER ?? 0.5;
export const TILT_WARN = constants.SERVE_SLOSH ?? 0.28;
export const LESSON_TEXT = "席の前で止まって、お茶を差し出す";

const FONT = `"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif`;

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, Number(n) || 0));
}

function rgba(hex, a) {
  const n = parseInt(String(hex || "#f3eee4").replace("#", ""), 16);
  if (!Number.isFinite(n)) return `rgba(243, 238, 228, ${a})`;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function pathDurOf(state) {
  const d = Number(state?.params?.pathDur);
  return d > 0 ? d : 60;
}

function timeToPos(state, target) {
  const pos = Number(state?.pos);
  if (!Number.isFinite(pos)) return Infinity;
  return (Number(target) - pos) * pathDurOf(state);
}

function currentSeatIndex(state) {
  const pos = Number(state?.pos);
  const seats = Array.isArray(state?.params?.seats) ? state.params.seats : [];
  if (!Number.isFinite(pos)) return -1;
  for (let i = 0; i < seats.length; i++) {
    if (pos >= seats[i].s0 - 1e-12 && pos <= seats[i].s1 + 1e-12) return i;
  }
  return -1;
}

function nextSeatTime(state) {
  const pos = Number(state?.pos);
  const seats = Array.isArray(state?.params?.seats) ? state.params.seats : [];
  if (!Number.isFinite(pos)) return Infinity;
  let best = Infinity;
  for (const seat of seats) {
    if (pos < seat.s0 - 1e-12) {
      const t = timeToPos(state, seat.s0);
      if (t < best) best = t;
    }
  }
  return best;
}

function inPaceBand(speed) {
  return Math.abs((Number(speed) || 0) - (constants.PACE_TARGET ?? 0.75)) <= (constants.PACE_INNER ?? 0.18);
}

/**
 * 再生中の状態文。優先は倒れ、廊下の終わり、席が近い、差し出す、出している、
 * 速すぎ、遅すぎ、こぼれそう、傾いている、安定して歩く。
 * @param {object} [state]
 * @returns {string}
 */
export function statusFrom(state) {
  if (state?.status !== "playing") return "";
  if (state?.phase !== "play") return "";
  if (state?.spilled) return "お茶がこぼれた";

  const endS = Number(state?.params?.endS);
  const endTarget = Number.isFinite(endS) ? endS : 1;
  if (timeToPos(state, endTarget) <= END_WARN) return "廊下の終わり";

  const seatI = currentSeatIndex(state);
  if (seatI < 0 && nextSeatTime(state) <= SEAT_WARN) return "席が近い";

  const stopped = !!state?.stopped || (Number(state?.left?.speed) || 0) <= STOP_SPEED;
  const prog = Array.isArray(state?.seatProg) ? state.seatProg : [];
  const serving = isServePose(state?.right);
  if (seatI >= 0 && stopped && !prog[seatI]?.served) {
    if (serving) return "お茶を出している";
    return "差し出す";
  }

  const speed = Number(state?.left?.speed) || 0;
  if (speed > FAST_SPEED) return "速すぎ";
  if (speed > STOP_SPEED && speed < SLOW_SPEED) return "遅すぎ";

  const teaMag = Number(state?.teaMag) || 0;
  if (teaMag > SLOSH_WARN) return "こぼれそう";
  if (tiltMag(state?.right) > TILT_WARN) return "盆が傾いている";

  if (speed > STOP_SPEED && inPaceBand(speed) && teaMag <= STEADY_INNER) {
    return "安定して歩く";
  }
  return "";
}

export function createFx() {
  return {
    clock: 0,
    trail: [],
    bits: [],
    floats: [],
    stepPhase: 0,
    andonSway: 0,
    placeLift: 0,
    revealZoom: 1,
    dailyAlpha: 0,
    lessonAlpha: 0,
    statusAlpha: 0,
    statusText: "",
    overlayX: 422,
    overlayY: 140,
    paceGlow: 0,
    prev: null,
  };
}

export function resetFx(fx) {
  if (!fx) return;
  fx.clock = 0;
  fx.trail.length = 0;
  fx.bits.length = 0;
  fx.floats.length = 0;
  fx.stepPhase = 0;
  fx.andonSway = 0;
  fx.placeLift = 0;
  fx.revealZoom = 1;
  fx.dailyAlpha = 0;
  fx.lessonAlpha = 0;
  fx.statusAlpha = 0;
  fx.statusText = "";
  fx.overlayX = 422;
  fx.overlayY = 140;
  fx.paceGlow = 0;
  fx.prev = null;
}

function spawnBalloons(fx, state) {
  const grade = state?.grade || "early";
  const score = Math.max(0, Math.floor(Number(state?.score) || 0));
  fx.floats.length = 0;
  fx.floats.push({
    kind: "grade",
    text: gradeCallout(grade),
    age: 0,
    color: "#1c2430",
  });
  fx.floats.push({
    kind: "score",
    text: `${formatScore(score)}点`,
    age: 0,
    color: "#1c2430",
  });
}

function addBits(fx, kind, state, reduced) {
  if (reduced) return;
  const n = kind === "spill" ? 10 : 6;
  const pos = Number(state?.pos);
  const x = Number.isFinite(pos) ? 52 + clamp(pos, 0, 1) * (800 - 52) : 280;
  const y = 132;
  for (let i = 0; i < n && fx.bits.length < BITS_CAP; i++) {
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
    const spd = (kind === "spill" ? 46 : 28) + Math.random() * 36;
    fx.bits.push({
      kind,
      x: x + (Math.random() - 0.5) * 10,
      y: y + (Math.random() - 0.5) * 6,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      r: 1.4 + Math.random() * 1.8,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 6,
      life: 0.45 + Math.random() * 0.35,
      max: 0.8,
      color: "#1a4a28",
    });
  }
}

function pushTrail(fx, state) {
  const pos = Number(state?.pos);
  if (!Number.isFinite(pos)) return;
  const last = fx.trail[fx.trail.length - 1];
  if (last && Math.abs(pos - last.pos) < 0.002 && fx.clock - last.at < 0.08) return;
  fx.trail.push({
    pos,
    tiltX: Number(state?.right?.tiltX) || 0,
    tiltY: Number(state?.right?.tiltY) || 0,
    sloshX: Number(state?.right?.sloshX) || 0,
    sloshY: Number(state?.right?.sloshY) || 0,
    teaMag: Number(state?.teaMag) || 0,
    stopped: !!state?.stopped,
    spilled: !!state?.spilled,
    at: fx.clock,
  });
  if (fx.trail.length > TRAIL_CAP) fx.trail.splice(0, fx.trail.length - TRAIL_CAP);
}

/**
 * @param {object} fx
 * @param {object} state
 * @param {number} dt
 * @param {{ reducedMotion?: boolean, right?: object, left?: object }} [opts]
 */
export function syncFx(fx, state, dt, opts = {}) {
  if (!fx) return;
  const reduced = !!opts.reducedMotion;
  const t = Math.max(0, Number(dt) || 0);
  fx.clock += t;

  const playing = state?.status === "playing";
  const phase = state?.phase;
  const over = state?.status === "over" || state?.status === "title";

  if (over) {
    fx.floats.length = 0;
    fx.bits.length = 0;
    fx.statusAlpha = 0;
    fx.statusText = "";
    fx.dailyAlpha = 0;
    fx.lessonAlpha = 0;
    fx.paceGlow = 0;
    fx.prev = {
      status: state?.status,
      phase: state?.phase,
      grade: state?.grade,
      score: state?.score,
      spilled: !!state?.spilled,
      softSpills: Number(state?.softSpills) || 0,
    };
    return;
  }

  const speed = Number(state?.left?.speed) || 0;
  if (playing && phase === "play") {
    fx.stepPhase += speed * t * Math.PI * 2 * 1.7;
  }

  const swayTarget = reduced ? 0 : Math.sin(fx.clock * 0.9) * 0.04;
  fx.andonSway += (swayTarget - fx.andonSway) * (1 - Math.exp(-t / 0.28));

  const placeT = Number(state?.phaseT) || 0;
  const placeTarget = playing && phase === "place" ? Math.max(0, 1 - placeT / 1.2) : 0;
  fx.placeLift += (placeTarget * 22 - fx.placeLift) * (1 - Math.exp(-t / 0.12));

  const wantDaily = !!(playing && phase === "play" && state?.showDaily);
  fx.dailyAlpha += ((wantDaily ? 1 : 0) - fx.dailyAlpha) * (1 - Math.exp(-t / 0.2));

  const wantLesson = !!(playing && phase === "play" && state?.showLesson);
  fx.lessonAlpha += ((wantLesson ? 1 : 0) - fx.lessonAlpha) * (1 - Math.exp(-t / 0.2));

  const nextStatus = statusFrom(state);
  if (nextStatus) fx.statusText = nextStatus;
  const wantStatus = nextStatus ? 1 : 0;
  if (!playing || phase !== "play") {
    fx.statusAlpha = 0;
    if (!nextStatus) fx.statusText = "";
  } else {
    fx.statusAlpha += (wantStatus - fx.statusAlpha) * (1 - Math.exp(-t / 0.16));
    if (fx.statusAlpha < 0.02 && !nextStatus) fx.statusText = "";
  }

  const glowWant = nextStatus === "安定して歩く" ? 1 : 0;
  fx.paceGlow += (glowWant - fx.paceGlow) * (1 - Math.exp(-t / 0.18));

  const pos = Number(state?.pos);
  if (Number.isFinite(pos)) {
    fx.overlayX = 52 + clamp(pos, 0, 1) * (800 - 52);
    fx.overlayY = 140;
  }

  const prevPhase = fx.prev?.phase;
  if (prevPhase !== "reveal" && phase === "reveal") {
    spawnBalloons(fx, state);
  }

  if (!fx.prev?.spilled && state?.spilled) addBits(fx, "spill", state, reduced);
  if ((Number(state?.softSpills) || 0) > (Number(fx.prev?.softSpills) || 0)) {
    addBits(fx, "soft", state, reduced);
  }

  if (playing && (phase === "play" || phase === "reveal")) {
    pushTrail(fx, state);
  }

  for (let i = fx.bits.length - 1; i >= 0; i--) {
    const p = fx.bits[i];
    p.life -= t;
    p.x += p.vx * t;
    p.y += p.vy * t;
    p.vy += 90 * t;
    p.vx *= Math.exp(-t / 0.45);
    p.rot += p.spin * t;
    if (p.life <= 0) fx.bits.splice(i, 1);
  }
  if (reduced) fx.bits.length = 0;
  if (fx.bits.length > BITS_CAP) fx.bits.splice(0, fx.bits.length - BITS_CAP);

  for (const f of fx.floats) {
    f.age = (Number(f.age) || 0) + t;
  }

  fx.prev = {
    status: state?.status,
    phase: state?.phase,
    grade: state?.grade,
    score: state?.score,
    spilled: !!state?.spilled,
    softSpills: Number(state?.softSpills) || 0,
  };
}

export function revealZoom(fx, reduced) {
  if (!fx) return 1;
  const z = Number(fx.revealZoom) || 1;
  if (reduced) return Math.min(z, 1.02);
  return z;
}

export function overlayCenter(fx) {
  return {
    x: Number(fx?.overlayX) || 422,
    y: Number(fx?.overlayY) || 140,
  };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} fx
 * @param {{ sx: Function, sy: Function, px: Function, reducedMotion?: boolean }} view
 * @param {object} [state]
 */
export function drawFx(ctx, fx, view, state) {
  if (!fx) return;
  const reduced = !!view.reducedMotion;
  const sx = (x) => view.sx(x);
  const sy = (y) => view.sy(y);
  const px = (w) => view.px(w);

  for (const p of fx.bits) {
    const u = Math.max(0, Math.min(1, p.life / (p.max || 1)));
    ctx.save();
    ctx.translate(sx(p.x), sy(p.y));
    ctx.rotate(p.rot || 0);
    ctx.globalAlpha = 0.28 + 0.5 * u;
    ctx.fillStyle = p.color || "#1a4a28";
    ctx.beginPath();
    ctx.ellipse(0, 0, px(p.r * 1.1), px(p.r * 1.6), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function pill(text, x, y, alpha, size = 13) {
    if (alpha <= 0.04 || !text) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.font = `700 ${Math.max(11, px(size))}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const tw = ctx.measureText(text).width;
    const padX = 8;
    const padY = 4;
    const h = Math.max(16, px(size + 2));
    ctx.fillStyle = rgba("#f3eee4", 0.94);
    ctx.strokeStyle = rgba("#1c2430", 0.42);
    ctx.lineWidth = Math.max(1, px(1));
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x - tw / 2 - padX, y - h / 2 - padY, tw + padX * 2, h + padY * 2, 6);
    } else {
      ctx.rect(x - tw / 2 - padX, y - h / 2 - padY, tw + padX * 2, h + padY * 2);
    }
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#1c2430";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  const playing = state?.status === "playing";
  const phase = state?.phase;
  if (playing && phase === "play") {
    const cx = sx(422);
    if (fx.dailyAlpha > 0.04) {
      pill(dailyCondition(state?.params), cx, sy(58), fx.dailyAlpha, 12);
    }
    if (fx.lessonAlpha > 0.04) {
      const ly = fx.dailyAlpha > 0.12 ? 80 : 62;
      pill(LESSON_TEXT, cx, sy(ly), fx.lessonAlpha, 15);
    }
    if (fx.statusAlpha > 0.05 && fx.statusText) {
      const pulse =
        reduced || fx.statusText !== "安定して歩く"
          ? 1
          : 1 + 0.03 * Math.sin((Number(fx.clock) || 0) * Math.PI * 2 * 2.0);
      ctx.save();
      ctx.translate(cx, sy(196));
      ctx.scale(pulse, pulse);
      pill(fx.statusText, 0, 0, fx.statusAlpha, 14);
      ctx.restore();
    }
  }

  const over = overlayCenter(fx);
  const bx = clamp(over.x, 220, 640);
  const by = clamp(over.y - JUDGE_BALLOON_OFFSET, 48, 210);
  const showBalloons = playing && phase === "reveal";
  for (let i = 0; showBalloons && i < fx.floats.length; i++) {
    const f = fx.floats[i];
    const age = Number(f.age) || 0;
    let pop = 1;
    if (!reduced) {
      if (age < 0.12) pop = 0.7 + 0.55 * (age / 0.12);
      else if (age < 0.22) pop = 1.25 - 0.25 * ((age - 0.12) / 0.1);
      else pop = 1;
    }
    const fade = Math.min(1, age / 0.08);
    const lift = reduced ? 0 : Math.min(8, age * 10);
    const row = f.kind === "grade" ? 0 : 22;
    const x = sx(bx);
    const y = sy(by + row) - px(lift);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pop, pop);
    ctx.globalAlpha = fade;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const size = f.kind === "grade" ? Math.max(16, px(20)) : Math.max(13, px(15));
    ctx.font = `700 ${size}px ${FONT}`;
    const tw = ctx.measureText(f.text).width;
    ctx.fillStyle = rgba("#f3eee4", 0.92);
    const padX = 8;
    const padY = 4;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(-tw / 2 - padX, -size / 2 - padY, tw + padX * 2, size + padY * 2, 6);
    } else {
      ctx.rect(-tw / 2 - padX, -size / 2 - padY, tw + padX * 2, size + padY * 2);
    }
    ctx.fill();
    ctx.fillStyle = f.color || "#1c2430";
    ctx.fillText(f.text, 0, 0);
    ctx.restore();
  }
}
