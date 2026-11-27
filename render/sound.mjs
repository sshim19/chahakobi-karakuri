/**
 * Web Audio だけで鳴らす効果音。ファイルもライブラリも使わない。
 * エンジンは触らず、state の変化から鳴らす音を決める。江戸の、落ち着いたからくりの音にする。
 */

import * as constants from "../engine/constants.mjs";
import { isServePose } from "../engine/tray.mjs";

export const MUTE_KEY = constants.STORAGE_MUTED ?? "chahakobi-karakuri:muted";
const MASTER_GAIN = 0.34;
const STOP_SPEED = constants.STOP_SPEED ?? 0.08;
const PACE_TARGET = constants.PACE_TARGET ?? 0.75;
const PACE_INNER = constants.PACE_INNER ?? 0.18;
const SOFT_SPILL = constants.SOFT_SPILL ?? 0.62;

function readMuted(storage) {
  if (!storage) return false;
  try {
    const v = storage.getItem(MUTE_KEY);
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

function writeMuted(muted, storage) {
  if (!storage) return;
  try {
    storage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadMuted(storage = globalThis.localStorage) {
  return readMuted(storage);
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function snapshot(state) {
  return {
    status: state?.status || "title",
    phase: state?.phase || "place",
    spilled: !!state?.spilled,
    softSpills: Number(state?.softSpills) || 0,
    seatsServed: Number(state?.seatsServed) || 0,
    seamHits: Number(state?.seamHits) || 0,
    stopped: !!state?.stopped,
    speed: Number(state?.left?.speed) || 0,
    teaMag: Number(state?.teaMag) || 0,
    servePose: isServePose(state?.right),
    grade: state?.grade ?? null,
    score: Math.max(0, Math.floor(Number(state?.score) || 0)),
    seed: state?.seed || state?.dateJst || "",
    playT: Number(state?.playT) || 0,
  };
}

/**
 * 直前の snapshot と新しい state から、鳴らすべき単発の音を決める。純関数。
 * @returns {{
 *   type: "place"|"stop"|"seam"|"soft"|"spill"|"offer"|"serve"|"reveal",
 *   grade?: string,
 *   score?: number
 * } | null}
 */
export function soundEvent(prev, state) {
  if (!state) return null;
  const now = snapshot(state);
  const before = prev || {
    status: "idle",
    phase: "none",
    spilled: false,
    softSpills: 0,
    seatsServed: 0,
    seamHits: 0,
    stopped: true,
    speed: 0,
    teaMag: 0,
    servePose: false,
  };

  if (!before.spilled && now.spilled) return { type: "spill" };

  if (
    now.status === "playing" &&
    now.phase === "place" &&
    (before.status !== "playing" || before.phase !== "place")
  ) {
    return { type: "place" };
  }

  if (before.phase !== "reveal" && now.phase === "reveal") {
    return { type: "reveal", grade: now.grade || "early", score: now.score };
  }
  if (before.status !== "over" && now.status === "over" && before.phase !== "reveal") {
    return { type: "reveal", grade: now.grade || "early", score: now.score };
  }

  if (now.softSpills > (Number(before.softSpills) || 0)) return { type: "soft" };
  if (now.seamHits > (Number(before.seamHits) || 0)) return { type: "seam" };
  if (now.seatsServed > (Number(before.seatsServed) || 0)) return { type: "serve" };
  if (!before.servePose && now.servePose) return { type: "offer" };
  if (!before.stopped && now.stopped && now.phase === "play") return { type: "stop" };

  return null;
}

export function createSfx() {
  return {
    prev: null,
    muted: loadMuted(),
    ctx: null,
    master: null,
    compressor: null,
    noiseBuf: null,
    gearSrc: null,
    gearFilter: null,
    gearGain: null,
    sloshOsc: null,
    sloshFilter: null,
    sloshGain: null,
    lastStepAt: 0,
    lastSloshAt: 0,
    stepSeed: 0,
  };
}

export function resetSfx(sfx) {
  if (!sfx) return;
  sfx.prev = null;
  sfx.lastStepAt = 0;
  sfx.lastSloshAt = 0;
  stopLoops(sfx, true);
}

function applyMuteGain(sfx, now) {
  if (!sfx?.master || !sfx.ctx) return;
  const g = sfx.master.gain;
  const t = now ?? sfx.ctx.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(sfx.muted ? 0 : MASTER_GAIN, t + 0.03);
}

export function setMuted(sfx, muted, storage = globalThis.localStorage) {
  if (!sfx) return;
  sfx.muted = !!muted;
  writeMuted(sfx.muted, storage);
  applyMuteGain(sfx);
}

export function isMuted(sfx) {
  return !!sfx?.muted;
}

/** 最初の操作で AudioContext を作り、iOS 向けに resume する。 */
export function unlockSfx(sfx) {
  if (!sfx) return;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return;
  try {
    if (!sfx.ctx) {
      const ctx = new AC();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.knee.value = 12;
      compressor.ratio.value = 2.8;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.18;
      const master = ctx.createGain();
      master.gain.value = sfx.muted ? 0 : MASTER_GAIN;
      master.connect(compressor);
      compressor.connect(ctx.destination);
      sfx.ctx = ctx;
      sfx.master = master;
      sfx.compressor = compressor;
    }
    if (sfx.ctx.state === "suspended") {
      const p = sfx.ctx.resume();
      if (p && typeof p.catch === "function") p.catch(() => {});
    }
  } catch {
    /* AudioContext unavailable */
  }
}

function noiseBuffer(sfx) {
  if (sfx.noiseBuf) return sfx.noiseBuf;
  const ctx = sfx.ctx;
  const len = Math.floor(ctx.sampleRate * 1.3);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = last * 0.86 + white * 0.14;
    data[i] = last * 2.0;
  }
  sfx.noiseBuf = buf;
  return buf;
}

function playTone(ctx, dest, { freq, type = "sine", t0, dur, peak, attack = 0.012, endFreq }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq && endFreq !== freq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + dur);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function playNoiseBurst(sfx, { t0, dur, peak, hp = 400, lp = 1800, attack = 0.008 }) {
  const ctx = sfx.ctx;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(sfx);
  src.loop = false;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime((hp + lp) / 2, t0);
  filter.Q.value = 0.9;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(sfx.master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

function hashSeed(s) {
  const str = String(s || "chahakobi-karakuri");
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seedShift(seed) {
  const h = hashSeed(seed);
  return ((h % 17) - 8) * 2;
}

function playPlace(sfx, seed) {
  const ctx = sfx.ctx;
  const t0 = ctx.currentTime;
  const d = seedShift(seed);
  playNoiseBurst(sfx, { t0, dur: 0.1, peak: 0.12, hp: 240, lp: 900, attack: 0.005 });
  playTone(ctx, sfx.master, { freq: 210 + d, type: "triangle", t0, dur: 0.14, peak: 0.07, endFreq: 140 });
  playTone(ctx, sfx.master, { freq: 620 + d * 2, type: "sine", t0: t0 + 0.03, dur: 0.1, peak: 0.045, endFreq: 400 });
}

function playStop(sfx) {
  const ctx = sfx.ctx;
  const t0 = ctx.currentTime;
  playTone(ctx, sfx.master, { freq: 160, type: "triangle", t0, dur: 0.12, peak: 0.05, endFreq: 90 });
  playNoiseBurst(sfx, { t0, dur: 0.08, peak: 0.05, hp: 180, lp: 600, attack: 0.006 });
}

function playSeam(sfx) {
  const ctx = sfx.ctx;
  const t0 = ctx.currentTime;
  playNoiseBurst(sfx, { t0, dur: 0.07, peak: 0.14, hp: 280, lp: 1100, attack: 0.003 });
  playTone(ctx, sfx.master, { freq: 240, type: "square", t0, dur: 0.06, peak: 0.03, endFreq: 120 });
}

function playSoft(sfx) {
  const ctx = sfx.ctx;
  const t0 = ctx.currentTime;
  playNoiseBurst(sfx, { t0, dur: 0.14, peak: 0.1, hp: 200, lp: 700, attack: 0.008 });
  playTone(ctx, sfx.master, { freq: 180, type: "sine", t0, dur: 0.16, peak: 0.04, endFreq: 90 });
}

function playSpill(sfx) {
  const ctx = sfx.ctx;
  const t0 = ctx.currentTime;
  playNoiseBurst(sfx, { t0, dur: 0.22, peak: 0.2, hp: 80, lp: 500, attack: 0.006 });
  playTone(ctx, sfx.master, { freq: 92, type: "triangle", t0, dur: 0.22, peak: 0.1, endFreq: 48 });
}

function playOffer(sfx) {
  const ctx = sfx.ctx;
  const t0 = ctx.currentTime;
  playNoiseBurst(sfx, { t0, dur: 0.1, peak: 0.06, hp: 500, lp: 1600, attack: 0.01 });
  playTone(ctx, sfx.master, { freq: 280, type: "triangle", t0, dur: 0.12, peak: 0.04, endFreq: 220 });
}

function playServe(sfx, seed) {
  const ctx = sfx.ctx;
  const t0 = ctx.currentTime;
  const d = seedShift(seed);
  playNoiseBurst(sfx, { t0, dur: 0.09, peak: 0.1, hp: 300, lp: 1200, attack: 0.005 });
  playTone(ctx, sfx.master, { freq: 540 + d * 2, type: "sine", t0, dur: 0.12, peak: 0.055, endFreq: 360 });
  playTone(ctx, sfx.master, { freq: 190 + d, type: "triangle", t0: t0 + 0.02, dur: 0.1, peak: 0.04, endFreq: 140 });
}

function playReveal(sfx, ev) {
  const ctx = sfx.ctx;
  const t0 = ctx.currentTime;
  playNoiseBurst(sfx, { t0, dur: 0.2, peak: 0.07, hp: 180, lp: 700, attack: 0.02 });
  playTone(ctx, sfx.master, { freq: 130, type: "sine", t0, dur: 0.26, peak: 0.05, endFreq: 70 });
  const grade = ev?.grade || "early";
  if (grade === "lofty") {
    playTone(ctx, sfx.master, { freq: 392, type: "sine", t0: t0 + 0.08, dur: 0.42, peak: 0.09 });
    playTone(ctx, sfx.master, { freq: 494, type: "sine", t0: t0 + 0.2, dur: 0.5, peak: 0.07 });
  } else if (grade === "good") {
    playTone(ctx, sfx.master, { freq: 330, type: "sine", t0: t0 + 0.08, dur: 0.38, peak: 0.08 });
    playTone(ctx, sfx.master, { freq: 392, type: "sine", t0: t0 + 0.2, dur: 0.42, peak: 0.06 });
  } else if (grade === "close") {
    playTone(ctx, sfx.master, { freq: 196, type: "sine", t0: t0 + 0.06, dur: 0.32, peak: 0.07, endFreq: 160 });
  } else {
    playNoiseBurst(sfx, { t0: t0 + 0.04, dur: 0.07, peak: 0.055, hp: 350, lp: 800, attack: 0.004 });
  }
}

function playStep(sfx, speed, inBand) {
  if (!sfx.ctx || !sfx.master) return;
  const now = sfx.ctx.currentTime;
  const v = Math.max(0, Number(speed) || 0);
  if (v <= STOP_SPEED) return;
  const interval = inBand
    ? clamp(0.34 / Math.max(0.45, v), 0.22, 0.48)
    : clamp(0.38 / Math.max(0.4, v), 0.2, 0.55) * (0.92 + ((sfx.stepSeed >>> 0) % 17) / 80);
  if (now - (sfx.lastStepAt || 0) < interval) return;
  sfx.lastStepAt = now;
  sfx.stepSeed = Math.imul((sfx.stepSeed || 1) ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  const peak = clamp(0.03 + v * 0.03, 0.03, 0.08);
  const jitter = inBand ? 0 : (sfx.stepSeed % 13) - 6;
  playNoiseBurst(sfx, { t0: now, dur: 0.045, peak, hp: 250, lp: 900, attack: 0.002 });
  playTone(sfx.ctx, sfx.master, {
    freq: 150 + v * 18 + jitter,
    type: "triangle",
    t0: now,
    dur: 0.04,
    peak: peak * 0.55,
  });
}

function ensureLoops(sfx) {
  const ctx = sfx.ctx;
  if (!ctx || !sfx.master) return;
  if (!sfx.gearSrc) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(sfx);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 220;
    filter.Q.value = 1.2;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(sfx.master);
    src.start();
    sfx.gearSrc = src;
    sfx.gearFilter = filter;
    sfx.gearGain = gain;
  }
  if (!sfx.sloshOsc) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 58;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 140;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(sfx.master);
    osc.start();
    sfx.sloshOsc = osc;
    sfx.sloshFilter = filter;
    sfx.sloshGain = gain;
  }
}

function stopLoops(sfx, immediate) {
  if (!sfx?.ctx) return;
  const t = sfx.ctx.currentTime;
  const fade = immediate ? 0.02 : 0.12;
  for (const g of [sfx.gearGain, sfx.sloshGain]) {
    if (!g) continue;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0, t + fade);
  }
}

function syncLoops(sfx, state) {
  if (!sfx.ctx || !sfx.master) return;
  const playing = state?.status === "playing";
  const phase = state?.phase;
  if (!playing || (phase !== "play" && phase !== "reveal")) {
    stopLoops(sfx, false);
    return;
  }
  ensureLoops(sfx);
  const t = sfx.ctx.currentTime;
  const speed = Number(state?.left?.speed) || 0;
  const walking = phase === "play" && speed > STOP_SPEED;
  const inBand = Math.abs(speed - PACE_TARGET) <= PACE_INNER;
  const teaMag = Number(state?.teaMag) || 0;
  const sloshWant = phase === "play" && teaMag > 0.32 ? clamp((teaMag - 0.32) / 0.5, 0, 1) : 0;

  if (sfx.gearGain) {
    const target = walking ? (inBand ? 0.045 : 0.07) * clamp(speed, 0, 1.1) : 0;
    sfx.gearGain.gain.cancelScheduledValues(t);
    sfx.gearGain.gain.setValueAtTime(sfx.gearGain.gain.value, t);
    sfx.gearGain.gain.linearRampToValueAtTime(target, t + 0.08);
  }
  if (sfx.gearFilter) {
    sfx.gearFilter.frequency.setTargetAtTime(180 + speed * 80, t, 0.08);
  }
  if (sfx.sloshGain) {
    sfx.sloshGain.gain.cancelScheduledValues(t);
    sfx.sloshGain.gain.setValueAtTime(sfx.sloshGain.gain.value, t);
    sfx.sloshGain.gain.linearRampToValueAtTime(sloshWant * (teaMag > SOFT_SPILL ? 0.09 : 0.055), t + 0.1);
  }
  if (sfx.sloshOsc) {
    sfx.sloshOsc.frequency.setTargetAtTime(48 + teaMag * 40, t, 0.1);
  }

  if (walking) playStep(sfx, speed, inBand);
}

function fire(sfx, ev) {
  if (!ev || !sfx.ctx || !sfx.master) return;
  const seed = sfx.prev?.seed || "";
  if (ev.type === "place") playPlace(sfx, seed);
  else if (ev.type === "stop") playStop(sfx);
  else if (ev.type === "seam") playSeam(sfx);
  else if (ev.type === "soft") playSoft(sfx);
  else if (ev.type === "spill") playSpill(sfx);
  else if (ev.type === "offer") playOffer(sfx);
  else if (ev.type === "serve") playServe(sfx, seed);
  else if (ev.type === "reveal") playReveal(sfx, ev);
}

export function syncSound(sfx, state) {
  if (!sfx) return;
  const ev = soundEvent(sfx.prev, state);
  sfx.prev = snapshot(state);
  if (sfx.ctx && ev) fire(sfx, ev);
  if (sfx.ctx) syncLoops(sfx, state);
}
