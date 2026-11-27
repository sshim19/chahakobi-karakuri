/** Dimensions, zones, time constants, gait / tray / spill, grades, and storage keys. Y is down in wu. */

export const VIEW_W = 844;
export const VIEW_H = 390;

export const LEFT_X0 = 0;
export const LEFT_X1 = 400;
export const LEFT_Y0 = 44;
export const LEFT_Y1 = 390;

export const RIGHT_X0 = 444;
export const RIGHT_X1 = 844;
export const RIGHT_Y0 = 44;
export const RIGHT_Y1 = 390;
/** After assignment only: play.mjs may keep the right pointer this far past the edge. */
export const RIGHT_EDGE_SLACK = 24;

export const LEVER_CX = 188;
export const LEVER_CY = 268;
export const GROOVE_W = 56;
export const GROOVE_H = 200;
/** y of gait 0 (stop). gait 1 is 200wu below. */
export const GAIT_Y0 = 168;
export const GAIT_SPAN = 200;
/** Groove-top stop zone (wu). A 22wu finger can still park here. */
export const STOP_SNAP = 36;
export const TAP_PATH = 10;
export const TAP_HOLD = 0.12;

export const TRAY_CX = 648;
export const TRAY_CY = 268;
export const LEVEL_RAD = 36;
export const TILT_R = 110;

export const PLACE_TIME = 1.2;
export const PLAY_TIME = 75;
export const FINISH_MIN = 22;
export const FINISH_MIN_TIME = FINISH_MIN;
export const REVEAL_TIME = 1.6;
export const SPILL_REVEAL_DELAY = 0.8;
export const DAILY_HINT_TIME = 2.5;
export const LESSON_HINT_TIME = 3.2;
export const FIXED_DT = 1 / 60;
export const MAX_DT = 0.05;

export const START_POS = 0.02;
export const START_TEA = 1;

/** Design defaults (§3). Phase 2 may retune within ±35%. */
export const DESIGN_GAIT_TAU = 0.16;
export const DESIGN_SPEED_TAU = 0.4;
export const DESIGN_GAIT_RELEASE = 0.55;
export const DESIGN_STOP_SPEED = 0.08;
export const DESIGN_SPEED_GAIN = 1.05;
export const DESIGN_PACE_TARGET = 0.75;
export const DESIGN_PACE_INNER = 0.18;
export const DESIGN_PACE_OUTER = 0.36;
export const DESIGN_TRAY_TAU = 0.12;
export const DESIGN_SLOSH_SPRING = 7.5;
export const DESIGN_SLOSH_DAMP = 2.8;
export const DESIGN_ACCEL_GAIN = 0.42;
export const DESIGN_SEAM_GAIN = 0.55;
export const DESIGN_SOFT_SPILL = 0.62;
export const DESIGN_HARD_SPILL = 0.88;
export const DESIGN_TEA_LOSS = 0.35;
export const DESIGN_TILT_RATE_GAIN = 5.0;

export const GAIT_TAU = 0.16;
export const SPEED_TAU = 0.4;
export const GAIT_RELEASE = 0.55;
export const STOP_SPEED = 0.08;
export const SPEED_GAIN = 1.05;

export const PACE_TARGET = 0.75;
export const PACE_INNER = 0.125;
export const PACE_OUTER = 0.25;

export const TRAY_TAU = 0.12;
export const SLOSH_SPRING = 5.4;
export const SLOSH_DAMP = 1.85;
export const ACCEL_GAIN = 0.55;
export const SEAM_GAIN = 0.74;
export const TILT_RATE_GAIN = 5.0;
export const GRAIN_GAIN = 1.0;
export const GRAIN_PERIOD = 0.15;
export const GRAIN_TILT_MUL = 10.0;

export const SOFT_SPILL = 0.56;
export const HARD_SPILL = 0.88;
export const TEA_LOSS = 0.35;

/** Design defaults (§4). Phase 3 may retune within ±35%. */
export const DESIGN_SERVE_TILT_X0 = 0.22;
export const DESIGN_SERVE_TILT_Y = 0.18;
export const DESIGN_SERVE_GOOD_T = 1.4;
export const DESIGN_SCORE_SERVE = 0.34;
export const DESIGN_SCORE_PACE = 0.28;
export const DESIGN_SCORE_STEADY = 0.22;
export const DESIGN_SCORE_CARE = 0.16;

export const SERVE_TILT_X0 = 0.18;
export const SERVE_TILT_X1 = 0.55;
export const SERVE_TILT_Y = 0.20;
export const SERVE_SLOSH = 0.28;
export const SERVE_GOOD_T = 1.4;

export const STEADY_INNER = 0.22;
export const STEADY_OUTER = 0.5;

export const PATH_DUR_MIN = 56;
export const PATH_DUR_MAX = 64;
export const SEAT_W_MIN = 1.6;
export const SEAT_W_MAX = 2.2;
export const SEAT_GAP_MIN = 8;
export const SEAT_GAP_MAX = 14;
export const END_MIN = 2.0;
export const END_MAX = 3.0;
export const SEAM_W_MIN = 0.012;
export const SEAM_W_MAX = 0.022;
export const SEAM_K_MIN = 2.0;
export const SEAM_K_MAX = 3.0;
export const FLOOR_MUL_JITTER = 0.04;

export const FLOOR_TABLE = {
  flat: {
    floor: "flat",
    seats: [2, 2],
    seams: [0, 1],
    firstSeam: 12,
    firstSeat: [6.4, 7.8],
    floorMul: 0.82,
  },
  normal: {
    floor: "normal",
    seats: [3, 3],
    seams: [1, 2],
    firstSeam: 8,
    firstSeat: [5.0, 6.4],
    floorMul: 1.0,
  },
  rough: {
    floor: "rough",
    seats: [3, 4],
    seams: [2, 4],
    firstSeam: 6,
    firstSeat: [4.0, 5.4],
    floorMul: 1.18,
  },
};

export const SCORE_LOFTY = 88;
export const SCORE_GOOD = 72;
export const SCORE_CLOSE = 55;
export const SCORE_OFF = 32;

export const SCORE_SERVE = 0.34;
export const SCORE_PACE = 0.28;
export const SCORE_STEADY = 0.15;
export const SCORE_CARE = 0.16;
export const CARE_SOFT = 0.28;
export const CARE_TEA = 0.24;
export const CARE_SPILL = 0.26;
export const CARE_MISS = 0.22;

export const JUDGE_BALLOON_OFFSET = 70;

export const STORAGE_BEST = "chahakobi-karakuri:bestScore";
export const STORAGE_DAILY_PREFIX = "chahakobi-karakuri:daily:";
export const STORAGE_MUTED = "chahakobi-karakuri:muted";
export const SEED_PREFIX = "chahakobi-karakuri:";

export const FLOOR_LABELS = { flat: "平ら", normal: "ふつう", rough: "目が立つ" };

export const GRADE_LABELS = {
  lofty: "よく届いた",
  good: "よい運び",
  close: "おしい",
  off: "よろけた",
  early: "まだ早い",
};

export const GRADE_BALLOONS = {
  lofty: "よく届いた！",
  good: "よい運び",
  close: "おしい",
  off: "よろけた",
  early: "まだ早い",
};

export const GRADE_SHARE = {
  lofty: "よく届いた",
  good: "よい運び",
  close: "おしい",
  off: "よろけた",
  early: "まだ早い",
};

export const GRADE_RESULT = {
  lofty: "よく届いたお茶",
  good: "よい運び",
  close: "おしい",
  off: "よろけた",
  early: "まだ早い",
};

export function seedString(dateJst) {
  return SEED_PREFIX + dateJst;
}

export function dailyKey(dateJst) {
  return STORAGE_DAILY_PREFIX + dateJst;
}

export function gradeForScore(score) {
  const s = Number(score) || 0;
  if (s >= SCORE_LOFTY) return "lofty";
  if (s >= SCORE_GOOD) return "good";
  if (s >= SCORE_CLOSE) return "close";
  if (s >= SCORE_OFF) return "off";
  return "early";
}

export function clamp(x, lo, hi) {
  const n = Number(x);
  if (!Number.isFinite(n)) return lo;
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * 1 when |x-mid| ≤ half, then linear to 0 at mid ± 2*half (floor 0).
 */
export function bump(x, mid, half) {
  const h = Number(half) || 0;
  if (!(h > 0)) return 0;
  const d = Math.abs((Number(x) || 0) - mid);
  if (d <= h) return 1;
  if (d >= 2 * h) return 0;
  return 1 - (d - h) / h;
}

/** 1 when |speed-0.75| ≤ inner, 0 when ≥ outer, linear between. Not for stopped speed. */
export function paceInst(speed) {
  const d = Math.abs((Number(speed) || 0) - PACE_TARGET);
  if (d <= PACE_INNER + 1e-12) return 1;
  if (d >= PACE_OUTER - 1e-12) return 0;
  return 1 - (d - PACE_INNER) / (PACE_OUTER - PACE_INNER);
}

/** 1 when teaMag ≤ 0.22, 0 when teaMag ≥ 0.50, linear between. */
export function steadyInst(teaMag) {
  const m = Number(teaMag) || 0;
  if (m <= STEADY_INNER + 1e-12) return 1;
  if (m >= STEADY_OUTER - 1e-12) return 0;
  return 1 - (m - STEADY_INNER) / (STEADY_OUTER - STEADY_INNER);
}

export function gaitDesired(y) {
  const yy = Number(y);
  if (!Number.isFinite(yy)) return 0;
  if (yy <= GAIT_Y0 + STOP_SNAP + 1e-12) return 0;
  return clamp((yy - GAIT_Y0) / GAIT_SPAN, 0, 1);
}

export function yFromGait(gait) {
  return GAIT_Y0 + clamp(gait, 0, 1) * GAIT_SPAN;
}

export function xFromGait() {
  return LEVER_CX;
}

/** Point on the gait groove. gait 0 is the stop end. */
export function pointOnLever(gait, xOff = 0) {
  return { x: LEVER_CX + xOff, y: yFromGait(gait) };
}
