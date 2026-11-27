/** dailyParams(rngState) → { params, rngState }. Idempotent daily corridor. */

import {
  END_MAX,
  END_MIN,
  FLOOR_MUL_JITTER,
  FLOOR_TABLE,
  PATH_DUR_MAX,
  PATH_DUR_MIN,
  SEAM_K_MAX,
  SEAM_K_MIN,
  SEAM_W_MAX,
  SEAM_W_MIN,
  SEAT_GAP_MAX,
  SEAT_GAP_MIN,
  SEAT_W_MAX,
  SEAT_W_MIN,
  START_POS,
  clamp,
} from "./constants.mjs";
import { rngRange, rngStep } from "./rng.mjs";

function pickFloor(u) {
  if (u < 0.3) return "flat";
  if (u < 0.7) return "normal";
  return "rough";
}

function pickInt(a, lo, hi) {
  if (lo === hi) return { value: lo, a };
  const step = rngStep(a);
  const n = lo + Math.min(hi - lo, Math.floor(step.value * (hi - lo + 1)));
  return { value: n, a: step.a };
}

function fitTimeline(first, widths, gaps, runout, budget) {
  let tFirst = first;
  let w = widths.slice();
  let g = gaps.slice();
  let end = runout;
  const total = () => tFirst + w.reduce((s, x) => s + x, 0) + g.reduce((s, x) => s + x, 0) + end;
  if (total() <= budget + 1e-9) return { first: tFirst, widths: w, gaps: g, runout: end };

  let extra = total() - budget;
  for (let i = 0; i < g.length && extra > 1e-9; i++) {
    const cut = Math.min(extra, Math.max(0, g[i] - SEAT_GAP_MIN));
    g[i] -= cut;
    extra -= cut;
  }
  if (extra > 1e-9) {
    const cut = Math.min(extra, Math.max(0, end - END_MIN));
    end -= cut;
    extra -= cut;
  }
  for (let i = 0; i < w.length && extra > 1e-9; i++) {
    const cut = Math.min(extra, Math.max(0, w[i] - SEAT_W_MIN));
    w[i] -= cut;
    extra -= cut;
  }
  if (extra > 1e-9) {
    const lo = 0.25;
    const cut = Math.min(extra, Math.max(0, tFirst - lo));
    tFirst -= cut;
    extra -= cut;
  }
  if (extra > 1e-9) {
    // Last resort: scale the remaining overflow out of gaps, then the start.
    const gapSum = g.reduce((s, x) => s + x, 0);
    if (gapSum > 1e-9) {
      const scale = Math.max(0, (gapSum - extra) / gapSum);
      for (let i = 0; i < g.length; i++) g[i] *= scale;
      extra = Math.max(0, total() - budget);
    }
    if (extra > 1e-9) tFirst = Math.max(0.25, tFirst - extra);
  }
  return { first: tFirst, widths: w, gaps: g, runout: end };
}

function overlapsSeam(list, s, w) {
  for (const other of list) {
    if (Math.abs(other.s - s) < (other.w + w) / 2 + 0.004) return true;
  }
  return false;
}

function insideSeat(seats, s, w) {
  const lo = s - w / 2;
  const hi = s + w / 2;
  for (const seat of seats) {
    if (hi >= seat.s0 - 1e-9 && lo <= seat.s1 + 1e-9) return true;
  }
  return false;
}

/**
 * Stream order: floor → floorMul jitter → pathDur → seat count and widths → gaps and end → seams.
 */
export function dailyParams(rngState) {
  let a = rngState >>> 0;
  let r = rngStep(a);
  a = r.a;
  const floor = pickFloor(r.value);
  const row = FLOOR_TABLE[floor];

  r = rngRange(a, -FLOOR_MUL_JITTER, FLOOR_MUL_JITTER);
  a = r.a;
  const floorMul = clamp(row.floorMul + r.value, row.floorMul - FLOOR_MUL_JITTER, row.floorMul + FLOOR_MUL_JITTER);

  r = rngRange(a, PATH_DUR_MIN, PATH_DUR_MAX);
  a = r.a;
  const pathDur = r.value;
  const budget = (1 - START_POS) * pathDur;

  const nPick = pickInt(a, row.seats[0], row.seats[1]);
  a = nPick.a;
  const n = nPick.value;

  r = rngRange(a, row.firstSeat[0], row.firstSeat[1]);
  a = r.a;
  let first = r.value;

  const widths = [];
  for (let i = 0; i < n; i++) {
    r = rngRange(a, SEAT_W_MIN, SEAT_W_MAX);
    a = r.a;
    widths.push(r.value);
  }

  const gaps = [];
  for (let i = 0; i < n - 1; i++) {
    r = rngRange(a, SEAT_GAP_MIN, SEAT_GAP_MAX);
    a = r.a;
    gaps.push(r.value);
  }

  r = rngRange(a, END_MIN, END_MAX);
  a = r.a;
  let runout = r.value;

  const fitted = fitTimeline(first, widths, gaps, runout, budget);
  first = fitted.first;
  const wOut = fitted.widths;
  const gOut = fitted.gaps;
  runout = fitted.runout;

  const seats = [];
  let t = first;
  for (let i = 0; i < n; i++) {
    const s0 = START_POS + t / pathDur;
    const s1 = START_POS + (t + wOut[i]) / pathDur;
    seats.push({ s0, s1 });
    t += wOut[i];
    if (i < n - 1) t += gOut[i];
  }
  const last = seats[seats.length - 1];
  const endS = Math.min(1, last.s1 + runout / pathDur);

  const seams = placeSeams(a, seats, pathDur, endS, row);
  a = seams.a;

  return {
    params: {
      floor,
      pathDur,
      floorMul,
      seats,
      seams: seams.list,
      endS,
    },
    rngState: a,
  };
}

function placeSeams(a, seats, pathDur, endS, row) {
  const countPick = pickInt(a, row.seams[0], row.seams[1]);
  a = countPick.a;
  const want = countPick.value;
  const minPos = START_POS + row.firstSeam / pathDur;
  const list = [];

  function windows(margin) {
    const out = [];
    for (let i = 0; i < seats.length - 1; i++) {
      const lo = Math.max(seats[i].s1 + margin, minPos);
      const hi = seats[i + 1].s0 - margin;
      if (hi - lo > 0.004) out.push({ lo, hi });
    }
    return out;
  }

  let wins = windows(0.008);
  if (!wins.length) wins = windows(0.003);
  if (!wins.length) wins = windows(0);

  for (let k = 0; k < want; k++) {
    let placed = false;
    for (let attempt = 0; attempt < 8 && !placed; attempt++) {
      const use = wins.length ? wins : windows(0);
      if (!use.length) break;
      let pick = rngStep(a);
      a = pick.a;
      const win = use[Math.min(use.length - 1, Math.floor(pick.value * use.length))];
      pick = rngRange(a, win.lo, win.hi);
      a = pick.a;
      const s = pick.value;
      pick = rngRange(a, SEAM_W_MIN, SEAM_W_MAX);
      a = pick.a;
      const w = pick.value;
      pick = rngRange(a, SEAM_K_MIN, SEAM_K_MAX);
      a = pick.a;
      const kv = pick.value;
      if (s >= minPos - 1e-9 && s + w / 2 <= endS + 1e-9 && !insideSeat(seats, s, w) && !overlapsSeam(list, s, w)) {
        list.push({ s, w, k: kv });
        placed = true;
      }
    }
    if (!placed) {
      const use = windows(0);
      let best = null;
      for (const win of use) {
        const mid = (win.lo + win.hi) / 2;
        const w = (SEAM_W_MIN + SEAM_W_MAX) / 2;
        const kv = (SEAM_K_MIN + SEAM_K_MAX) / 2;
        if (mid >= minPos - 1e-9 && !insideSeat(seats, mid, w) && !overlapsSeam(list, mid, w)) {
          const span = win.hi - win.lo;
          if (!best || span > best.span) best = { s: mid, w, k: kv, span };
        }
      }
      if (best) list.push({ s: best.s, w: best.w, k: best.k });
    }
  }

  list.sort((x, y) => x.s - y.s);
  return { list, a };
}

/** Corridor time at speed = 1 from pos 0. */
export function timeAtPos(params, pos) {
  const dur = Number(params?.pathDur) || 0;
  if (!(dur > 0)) return 0;
  return Number(pos) * dur;
}

/** pos after `t` seconds of walking at speed = 1 from pos 0. */
export function posAtTime(params, t) {
  const dur = Number(params?.pathDur) || 0;
  if (!(dur > 0)) return 0;
  return (Number(t) || 0) / dur;
}

/** Seconds of walking at speed 1 from play start (pos = START_POS) to a corridor pos. */
export function timeFromStart(params, pos) {
  const dur = Number(params?.pathDur) || 0;
  if (!(dur > 0)) return 0;
  return (Number(pos) - START_POS) * dur;
}

export function seatIndexAt(params, pos) {
  const seats = params?.seats || [];
  for (let i = 0; i < seats.length; i++) {
    if (pos >= seats[i].s0 - 1e-12 && pos <= seats[i].s1 + 1e-12) return i;
  }
  return -1;
}

export function seamAt(params, pos) {
  const seams = params?.seams || [];
  for (const seam of seams) {
    if (Math.abs(pos - seam.s) <= seam.w / 2 + 1e-12) return seam;
  }
  return null;
}
