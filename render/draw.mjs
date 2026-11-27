/**
 * 座敷・畳・廊下・からくり・盆・茶碗・席・段差・左右の域・縮小図。
 * 844×390 論理座標。Y は下向き。カメラは描画側だけが持つ。画像アセットは使わない。
 */

import * as constants from "../engine/constants.mjs";
import { isServePose, pointOnTray, tiltMag } from "../engine/tray.mjs";
import { drawFx, revealZoom } from "./fx.mjs";
import { drawMotionGuides } from "./hand-guides.mjs";

export const VIEW_W = constants.VIEW_W ?? 844;
export const VIEW_H = constants.VIEW_H ?? 390;

export const LEFT_X0 = constants.LEFT_X0 ?? 0;
export const LEFT_X1 = constants.LEFT_X1 ?? 400;
export const LEFT_Y0 = constants.LEFT_Y0 ?? 44;
export const LEFT_Y1 = constants.LEFT_Y1 ?? 390;

export const RIGHT_X0 = constants.RIGHT_X0 ?? 444;
export const RIGHT_X1 = constants.RIGHT_X1 ?? 844;
export const RIGHT_Y0 = constants.RIGHT_Y0 ?? 44;
export const RIGHT_Y1 = constants.RIGHT_Y1 ?? 390;
export const RIGHT_EDGE_SLACK = constants.RIGHT_EDGE_SLACK ?? 24;

export const LEVER_CX = constants.LEVER_CX ?? 188;
export const LEVER_CY = constants.LEVER_CY ?? 268;
export const GROOVE_W = constants.GROOVE_W ?? 56;
export const GROOVE_H = constants.GROOVE_H ?? 200;
export const GAIT_Y0 = constants.GAIT_Y0 ?? 168;
export const GAIT_SPAN = constants.GAIT_SPAN ?? 200;
export const STOP_SNAP = constants.STOP_SNAP ?? 36;

export const TRAY_CX = constants.TRAY_CX ?? 648;
export const TRAY_CY = constants.TRAY_CY ?? 268;
export const LEVEL_RAD = constants.LEVEL_RAD ?? 36;
export const TILT_R = constants.TILT_R ?? 110;

export const PACE_TARGET = constants.PACE_TARGET ?? 0.75;
export const PACE_INNER = constants.PACE_INNER ?? 0.18;
export const SPEED_GAIN = constants.SPEED_GAIN ?? 1.05;
export const STOP_SPEED = constants.STOP_SPEED ?? 0.08;

export const HALL_X0 = 52;
export const HALL_X1 = 800;
export const HALL_Y0 = 78;
export const HALL_Y1 = 178;
export const HALL_FLOOR = 158;

export const MINIMAP = { x: 16, y: 48, w: 248, h: 52 };
export const THUMB_GUIDE_R = 22; // 直径 44wu

const WALL_A = "#e4d8c4";
const WALL_B = "#cbbba0";
const PILLAR_A = "#4a3224";
const PILLAR_B = "#2e1e16";
const TATAMI_A = "#6a7a48";
const TATAMI_B = "#5c6c3e";
const TATAMI_C = "#7a8a56";
const HERIBORDER = "#2a2c38";
const ANDON = "#d4a45a";
const LAMP = "#f0d090";
const ZABUTON = "#7a2c28";
const ZEN = "#3a2a1c";
const WOOD_A = "#c4a070";
const WOOD_B = "#8a6840";
const METAL = "#8a8c90";
const TRAY = "#3a2418";
const CUP = "#2a2420";
const TEA = "#1a4a28";
const SEAM = "#d8d0c4";
const INK = "#1c2430";
const HUD_BG = "#f3eee4";
const FONT = `"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif`;

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, Number(n) || 0));
}

function clamp01(n) {
  return clamp(n, 0, 1);
}

function rgba(hex, a) {
  const n = parseInt(String(hex || "#ffffff").replace("#", ""), 16);
  if (!Number.isFinite(n)) return `rgba(255, 255, 255, ${a})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function syncCanvasSize(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const cssW = Math.max(1, canvas.clientWidth || VIEW_W);
  const cssH = Math.max(1, canvas.clientHeight || VIEW_H);
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { cssW, cssH, dpr };
}

/**
 * 高さに合わせて 844×390 を伸ばし、幅が足りなければ contain する。
 * 余った部分は同じ壁色で埋める。
 */
export function makeView(cssW, cssH) {
  let scale = cssH / VIEW_H;
  if (VIEW_W * scale > cssW + 0.5) scale = cssW / VIEW_W;
  const drawW = VIEW_W * scale;
  const drawH = VIEW_H * scale;
  const ox = (cssW - drawW) / 2;
  const oy = (cssH - drawH) / 2;
  return {
    scale,
    ox,
    oy,
    drawW,
    drawH,
    cssW,
    cssH,
    sx(x) {
      return ox + x * scale;
    },
    sy(y) {
      return oy + y * scale;
    },
    px(wu) {
      return wu * scale;
    },
    worldX(cssX) {
      return (cssX - ox) / scale;
    },
    worldY(cssY) {
      return (cssY - oy) / scale;
    },
  };
}

/**
 * クライアント座標をキャンバス論理座標（0..844, 0..390, Y 下向き）へ。
 * @returns {{ x: number, y: number }}
 */
export function clientToLogical(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const cssW = canvas.clientWidth || rect.width || VIEW_W;
  const cssH = canvas.clientHeight || rect.height || VIEW_H;
  const view = makeView(cssW, cssH);
  const cssX = ((clientX - rect.left) / (rect.width || 1)) * cssW;
  const cssY = ((clientY - rect.top) / (rect.height || 1)) * cssH;
  return { x: view.worldX(cssX), y: view.worldY(cssY) };
}

export function inLeftZone(x, y) {
  return x >= LEFT_X0 && x <= LEFT_X1 && y >= LEFT_Y0 && y <= LEFT_Y1;
}

export function inRightZone(x, y, slack = 0) {
  return (
    x >= RIGHT_X0 - slack &&
    x <= RIGHT_X1 + slack &&
    y >= RIGHT_Y0 - slack &&
    y <= RIGHT_Y1 + slack
  );
}

export function hallX(pos) {
  return HALL_X0 + clamp01(pos) * (HALL_X1 - HALL_X0);
}

function seatsOf(state) {
  return Array.isArray(state?.params?.seats) ? state.params.seats : [];
}

function seamsOf(state) {
  return Array.isArray(state?.params?.seams) ? state.params.seams : [];
}

function floorOf(state) {
  return state?.params?.floor || "normal";
}

function grainOf(floor) {
  if (floor === "flat") return 0.28;
  if (floor === "rough") return 0.95;
  return 0.58;
}


function fillWall(ctx, view) {
  ctx.fillStyle = WALL_A;
  ctx.fillRect(0, 0, view.cssW, view.cssH);
  const x = view.sx(0);
  const y = view.sy(0);
  const w = view.px(VIEW_W);
  const h = view.px(VIEW_H);
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, WALL_A);
  g.addColorStop(0.62, WALL_B);
  g.addColorStop(1, WALL_B);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

function drawFusuma(ctx, view) {
  const panels = [
    [36, 8, 150, 68],
    [200, 8, 150, 68],
    [494, 8, 150, 68],
    [658, 8, 150, 68],
  ];
  for (const [x, y, w, h] of panels) {
    const px = view.sx(x);
    const py = view.sy(y);
    const pw = view.px(w);
    const ph = view.px(h);
    ctx.fillStyle = rgba("#d8ccb4", 0.7);
    ctx.strokeStyle = rgba(PILLAR_A, 0.55);
    ctx.lineWidth = Math.max(1, view.px(1.4));
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(px, py, pw, ph, view.px(2));
    else ctx.rect(px, py, pw, ph);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = rgba(PILLAR_A, 0.22);
    ctx.lineWidth = Math.max(1, view.px(1));
    ctx.strokeRect(px + view.px(8), py + view.px(6), pw - view.px(16), ph - view.px(12));
  }
}

function drawPillar(ctx, view, x, y, w, h) {
  const px = view.sx(x);
  const py = view.sy(y);
  const pw = view.px(w);
  const ph = view.px(h);
  const g = ctx.createLinearGradient(px, py, px + pw, py);
  g.addColorStop(0, PILLAR_B);
  g.addColorStop(0.35, PILLAR_A);
  g.addColorStop(1, PILLAR_B);
  ctx.fillStyle = g;
  ctx.fillRect(px, py, pw, ph);
  ctx.fillStyle = rgba("#6a4a34", 0.35);
  ctx.fillRect(px + pw * 0.18, py, view.px(2.2), ph);
}

function drawAndon(ctx, view, x, y, sway, reduced) {
  const tilt = reduced ? 0 : sway;
  ctx.save();
  ctx.translate(view.sx(x), view.sy(y));
  ctx.rotate(tilt);
  const w = view.px(18);
  const h = view.px(26);
  ctx.fillStyle = PILLAR_B;
  ctx.fillRect(-view.px(1.2), -h - view.px(8), view.px(2.4), view.px(10));
  ctx.fillStyle = ANDON;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(-w / 2, -h, w, h, view.px(2));
  else ctx.rect(-w / 2, -h, w, h);
  ctx.fill();
  ctx.fillStyle = rgba(LAMP, 0.92);
  ctx.fillRect(-w * 0.28, -h + view.px(4), w * 0.56, h - view.px(8));
  if (!reduced) {
    const glow = ctx.createRadialGradient(0, -h * 0.4, 0, 0, -h * 0.4, view.px(36));
    glow.addColorStop(0, rgba(LAMP, 0.28));
    glow.addColorStop(1, rgba(LAMP, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, -h * 0.3, view.px(36), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawRoom(ctx, view, fx, reduced) {
  drawFusuma(ctx, view);
  drawPillar(ctx, view, 18, 4, 16, 210);
  drawPillar(ctx, view, 810, 4, 16, 210);
  drawPillar(ctx, view, 410, 4, 12, 74);
  const sway = Number(fx?.andonSway) || 0;
  drawAndon(ctx, view, 34, 70, sway, reduced);
  drawAndon(ctx, view, 818, 70, -sway * 0.8, reduced);
  // 勝手口
  ctx.fillStyle = rgba(PILLAR_B, 0.55);
  ctx.fillRect(view.sx(28), view.sy(86), view.px(28), view.px(92));
  ctx.fillStyle = rgba("#1c1410", 0.55);
  ctx.fillRect(view.sx(32), view.sy(92), view.px(20), view.px(82));
}

function drawCorridor(ctx, view, state, opts = {}) {
  const reduced = !!opts.reducedMotion;
  const x0 = view.sx(HALL_X0 - 8);
  const x1 = view.sx(HALL_X1 + 8);
  const y0 = view.sy(HALL_Y0);
  const y1 = view.sy(HALL_Y1);
  const g = ctx.createLinearGradient(x0, y0, x0, y1);
  g.addColorStop(0, TATAMI_B);
  g.addColorStop(0.45, TATAMI_A);
  g.addColorStop(1, TATAMI_C);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(view.sx(HALL_X0 + 16), y0);
  ctx.lineTo(view.sx(HALL_X1 - 16), y0);
  ctx.lineTo(view.sx(HALL_X1 + 8), y1);
  ctx.lineTo(view.sx(HALL_X0 - 8), y1);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = HERIBORDER;
  ctx.lineWidth = Math.max(2, view.px(2.4));
  ctx.beginPath();
  ctx.moveTo(view.sx(HALL_X0 - 8), y1);
  ctx.lineTo(view.sx(HALL_X1 + 8), y1);
  ctx.stroke();
  ctx.lineWidth = Math.max(1.4, view.px(1.8));
  ctx.beginPath();
  ctx.moveTo(view.sx(HALL_X0 + 16), y0);
  ctx.lineTo(view.sx(HALL_X1 - 16), y0);
  ctx.stroke();

  const floor = floorOf(state);
  const grain = grainOf(floor);
  const mats = 9;
  for (let i = 0; i < mats; i++) {
    const u0 = i / mats;
    const u1 = (i + 1) / mats;
    const ax = hallX(u0);
    const bx = hallX(u1);
    ctx.strokeStyle = rgba(HERIBORDER, 0.55);
    ctx.lineWidth = Math.max(1, view.px(1.2));
    ctx.beginPath();
    ctx.moveTo(view.sx(ax), y0);
    ctx.lineTo(view.sx(ax), y1);
    ctx.stroke();
    const lines = 3 + (floor === "rough" ? 2 : floor === "flat" ? 0 : 1);
    ctx.strokeStyle = rgba("#3e4c28", 0.22 + 0.38 * grain);
    ctx.lineWidth = Math.max(1, view.px(0.8));
    for (let k = 1; k <= lines; k++) {
      const t = k / (lines + 1);
      const xx = ax + (bx - ax) * t;
      ctx.beginPath();
      ctx.moveTo(view.sx(xx), view.sy(HALL_Y0 + 4));
      ctx.lineTo(view.sx(xx), view.sy(HALL_Y1 - 4));
      ctx.stroke();
    }
  }

  if (!reduced) {
    const sheen = ctx.createLinearGradient(x0, y0, x1, y1);
    sheen.addColorStop(0, rgba("#d8e0b8", 0));
    sheen.addColorStop(0.45, rgba("#d8e0b8", 0.08));
    sheen.addColorStop(1, rgba("#d8e0b8", 0));
    ctx.fillStyle = sheen;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }

  drawSeams(ctx, view, state);
  drawSeats(ctx, view, state);
}

function drawSeams(ctx, view, state) {
  for (const seam of seamsOf(state)) {
    const s = Number(seam?.s);
    const w = Number(seam?.w) || 0.016;
    if (!Number.isFinite(s)) continue;
    const x = view.sx(hallX(s));
    const hw = Math.max(view.px(6), view.px(w * (HALL_X1 - HALL_X0) * 1.8));
    const y0 = view.sy(HALL_Y0 + 2);
    const y1 = view.sy(HALL_Y1 - 2);
    ctx.fillStyle = rgba("#2a2c38", 0.35);
    ctx.fillRect(x - hw * 0.15, y0 + view.px(2), hw * 1.15, y1 - y0);
    ctx.fillStyle = SEAM;
    ctx.fillRect(x - hw / 2, y0, hw, y1 - y0);
    ctx.strokeStyle = rgba(PILLAR_B, 0.7);
    ctx.lineWidth = Math.max(1, view.px(1.1));
    ctx.strokeRect(x - hw / 2, y0, hw, y1 - y0);
    // 段の高さ
    ctx.fillStyle = rgba("#f4efe6", 0.7);
    ctx.fillRect(x - hw / 2, y0, hw, Math.max(2, view.px(3)));
  }
}

function drawSeats(ctx, view, state) {
  const prog = Array.isArray(state?.seatProg) ? state.seatProg : [];
  seatsOf(state).forEach((seat, i) => {
    const mid = (Number(seat.s0) + Number(seat.s1)) / 2;
    const x = view.sx(hallX(mid));
    const y = view.sy(HALL_Y0 + 22);
    const served = !!prog[i]?.served;
    const bw = view.px(22);
    const bh = view.px(16);
    ctx.fillStyle = ZABUTON;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, view.px(3));
    else ctx.rect(x - bw / 2, y - bh / 2, bw, bh);
    ctx.fill();
    ctx.strokeStyle = rgba("#3a1010", 0.7);
    ctx.lineWidth = Math.max(1, view.px(1));
    ctx.stroke();
    const zx = x;
    const zy = y + view.px(16);
    const zw = view.px(16);
    const zh = view.px(8);
    ctx.fillStyle = ZEN;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(zx - zw / 2, zy - zh / 2, zw, zh, view.px(1.4));
    else ctx.rect(zx - zw / 2, zy - zh / 2, zw, zh);
    ctx.fill();
    ctx.strokeStyle = rgba("#1a100c", 0.8);
    ctx.stroke();
    if (served) {
      ctx.fillStyle = CUP;
      ctx.fillRect(zx - view.px(3.2), zy - view.px(8), view.px(6.4), view.px(6));
      ctx.fillStyle = TEA;
      ctx.fillRect(zx - view.px(2.2), zy - view.px(7.2), view.px(4.4), view.px(2.4));
    }
  });
}


function gaitBandY() {
  const loGait = clamp((PACE_TARGET - PACE_INNER) / SPEED_GAIN, 0, 1);
  const hiGait = clamp((PACE_TARGET + PACE_INNER) / SPEED_GAIN, 0, 1);
  return {
    y0: GAIT_Y0 + loGait * GAIT_SPAN,
    y1: GAIT_Y0 + hiGait * GAIT_SPAN,
  };
}

function drawLever(ctx, view, state, fx) {
  const x = view.sx(LEVER_CX - GROOVE_W / 2);
  const y = view.sy(GAIT_Y0 - 8);
  const w = view.px(GROOVE_W);
  const h = view.px(GROOVE_H + 16);
  ctx.fillStyle = rgba(PILLAR_A, 0.92);
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, view.px(6));
  else ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.strokeStyle = rgba(PILLAR_B, 0.9);
  ctx.lineWidth = Math.max(1.2, view.px(1.4));
  ctx.stroke();

  const stopH = view.px(STOP_SNAP);
  ctx.fillStyle = rgba("#2a1c14", 0.72);
  ctx.fillRect(x + view.px(6), view.sy(GAIT_Y0), w - view.px(12), stopH);

  const band = gaitBandY();
  const by = view.sy(band.y0);
  const bh = view.sy(band.y1) - by;
  const glow = clamp(Number(fx?.paceGlow) || 0, 0, 1);
  ctx.fillStyle = rgba("#c4a070", 0.34 + 0.4 * glow);
  ctx.fillRect(x + view.px(8), by, w - view.px(16), bh);
  ctx.strokeStyle = rgba("#f0d090", 0.55 + 0.4 * glow);
  ctx.lineWidth = Math.max(1.4, view.px(1.8));
  ctx.strokeRect(x + view.px(8), by, w - view.px(16), bh);

  const slotX = view.sx(LEVER_CX - 6);
  ctx.fillStyle = rgba("#1a120e", 0.85);
  ctx.fillRect(slotX, view.sy(GAIT_Y0), view.px(12), view.px(GAIT_SPAN));

  const gait = clamp01(state?.left?.gait);
  const knoby = view.sy(GAIT_Y0 + gait * GAIT_SPAN);
  ctx.beginPath();
  ctx.arc(view.sx(LEVER_CX), knoby, view.px(9), 0, Math.PI * 2);
  ctx.fillStyle = WOOD_A;
  ctx.fill();
  ctx.strokeStyle = WOOD_B;
  ctx.lineWidth = Math.max(1.2, view.px(1.5));
  ctx.stroke();
}

function drawTrayPad(ctx, view, state) {
  const cx = view.sx(TRAY_CX);
  const cy = view.sy(TRAY_CY);
  ctx.beginPath();
  ctx.arc(cx, cy, view.px(TILT_R), 0, Math.PI * 2);
  ctx.fillStyle = rgba(PILLAR_A, 0.28);
  ctx.fill();
  ctx.strokeStyle = rgba(PILLAR_B, 0.45);
  ctx.lineWidth = Math.max(1, view.px(1.2));
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, view.px(LEVEL_RAD), 0, Math.PI * 2);
  ctx.fillStyle = rgba(HUD_BG, 0.42);
  ctx.fill();
  ctx.strokeStyle = rgba(INK, 0.55);
  ctx.lineWidth = Math.max(1.6, view.px(2));
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, view.px(4), 0, Math.PI * 2);
  ctx.fillStyle = rgba(INK, 0.45);
  ctx.fill();

  const tiltX = Number(state?.right?.tiltX) || 0;
  const tiltY = Number(state?.right?.tiltY) || 0;
  const bead = pointOnTray(tiltX, tiltY);
  ctx.beginPath();
  ctx.arc(view.sx(bead.x), view.sy(bead.y), view.px(6), 0, Math.PI * 2);
  ctx.fillStyle = TRAY;
  ctx.fill();
  ctx.strokeStyle = rgba(HUD_BG, 0.55);
  ctx.lineWidth = Math.max(1, view.px(1.2));
  ctx.stroke();
}

function drawThumbGuide(ctx, view, x, y, active, hint) {
  const r = view.px(THUMB_GUIDE_R);
  ctx.save();
  ctx.beginPath();
  ctx.arc(view.sx(x), view.sy(y), r, 0, Math.PI * 2);
  ctx.fillStyle = rgba(HUD_BG, active ? 0.42 : hint ? 0.34 : 0.22);
  ctx.strokeStyle = rgba(INK, active ? 0.55 : 0.32);
  ctx.lineWidth = Math.max(1.2, view.px(1.6));
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(view.sx(x), view.sy(y), r * 0.42, 0, Math.PI * 2);
  ctx.strokeStyle = rgba(INK, 0.22);
  ctx.lineWidth = Math.max(1, view.px(1));
  ctx.stroke();
  ctx.restore();
}

function leftThumbPos(left, state) {
  const gait = clamp01(state?.left?.gait);
  const yRest = GAIT_Y0 + gait * GAIT_SPAN;
  if (left?.active && Number.isFinite(left.x) && Number.isFinite(left.y)) {
    return {
      x: LEVER_CX,
      y: clamp(left.y, GAIT_Y0, GAIT_Y0 + GAIT_SPAN),
      active: true,
    };
  }
  return { x: LEVER_CX, y: yRest, active: false };
}

function rightThumbPos(right, state) {
  if (right?.active && Number.isFinite(right.x) && Number.isFinite(right.y)) {
    const dx = right.x - TRAY_CX;
    const dy = right.y - TRAY_CY;
    const r = Math.hypot(dx, dy);
    if (r > TILT_R && r > 0) {
      return { x: TRAY_CX + (dx / r) * TILT_R, y: TRAY_CY + (dy / r) * TILT_R, active: true };
    }
    return { x: right.x, y: right.y, active: true };
  }
  const p = pointOnTray(Number(state?.right?.tiltX) || 0, Number(state?.right?.tiltY) || 0);
  return { x: p.x, y: p.y, active: false };
}


function drawCup(ctx, view, x, y, tea, sloshX, sloshY, spilled, lift) {
  const px = view.px.bind(view);
  ctx.save();
  ctx.translate(view.sx(x), view.sy(y - lift));
  if (spilled) {
    ctx.rotate(0.9);
    ctx.fillStyle = rgba(TEA, 0.7);
    ctx.beginPath();
    ctx.ellipse(px(8), px(6), px(10), px(4), 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = CUP;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(-px(8), -px(6.5), px(16), px(13), px(2));
  else ctx.rect(-px(8), -px(6.5), px(16), px(13));
  ctx.fill();
  // Light rim so the dark bowl stays visible on the dark tray.
  ctx.strokeStyle = rgba("#e4d8c4", 0.92);
  ctx.lineWidth = Math.max(1.2, px(1.4));
  ctx.stroke();
  if (!spilled && tea > 0.02) {
    const ox = sloshX * px(3.6);
    const oy = sloshY * px(2.4);
    ctx.fillStyle = TEA;
    ctx.beginPath();
    ctx.ellipse(ox, -px(2.4) + oy, px(5.6), px(2.8 + tea * 0.8), sloshX * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawDoll(ctx, view, state, fx) {
  const pos = Number(state?.pos);
  const x = hallX(Number.isFinite(pos) ? pos : 0.02);
  const floorY = HALL_FLOOR;
  const speed = Number(state?.left?.speed) || 0;
  const walking = speed > STOP_SPEED && state?.phase === "play";
  const inBand = Math.abs(speed - PACE_TARGET) <= PACE_INNER;
  const phase = Number(fx?.stepPhase) || (Number.isFinite(pos) ? pos * 48 : 0);
  const hitch = walking && !inBand ? 0.2 * Math.sin(phase * 2.1) : 0;
  const stepL = walking ? Math.max(0, Math.sin(phase + hitch)) : 0;
  const stepR = walking ? Math.max(0, Math.sin(phase + Math.PI - hitch)) : 0;
  const bob = walking ? (inBand ? 1.1 : 1.8) * Math.abs(Math.sin(phase)) : 0;
  const tiltX = Number(state?.right?.tiltX) || 0;
  const tiltY = Number(state?.right?.tiltY) || 0;
  const sloshX = Number(state?.right?.sloshX) || 0;
  const sloshY = Number(state?.right?.sloshY) || 0;
  const offering = isServePose(state?.right);
  const reach = offering ? 16 : 6 + tiltX * 12;
  const bodyY = floorY - 36 - bob;
  const px = view.px.bind(view);

  ctx.save();
  // 影
  ctx.fillStyle = rgba("#1c2430", 0.22);
  ctx.beginPath();
  ctx.ellipse(view.sx(x), view.sy(floorY + 4), px(16), px(5), 0, 0, Math.PI * 2);
  ctx.fill();

  const leg = (side, lift, kick) => {
    const lx = x + side * 4.5;
    const top = bodyY + 18;
    const footY = floorY - lift * 6;
    const footX = lx + side * 1.2 + kick * 5;
    ctx.strokeStyle = WOOD_B;
    ctx.lineWidth = Math.max(2.2, px(3.2));
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(view.sx(lx), view.sy(top));
    ctx.lineTo(view.sx(footX), view.sy(footY));
    ctx.stroke();
    ctx.fillStyle = WOOD_B;
    ctx.beginPath();
    ctx.ellipse(view.sx(footX + side * 2), view.sy(footY), px(5), px(2.2), 0, 0, Math.PI * 2);
    ctx.fill();
  };
  leg(-1, stepL, walking ? Math.cos(phase + hitch) : 0);
  leg(1, stepR, walking ? Math.cos(phase + Math.PI - hitch) : 0);

  // 胴
  const tx = view.sx(x);
  const ty = view.sy(bodyY);
  ctx.fillStyle = WOOD_A;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(tx - px(9), ty - px(4), px(18), px(26), px(3));
  else ctx.rect(tx - px(9), ty - px(4), px(18), px(26));
  ctx.fill();
  ctx.strokeStyle = WOOD_B;
  ctx.lineWidth = Math.max(1, px(1.2));
  ctx.stroke();
  // 金物と歯車（顔は描き込まない）
  ctx.beginPath();
  ctx.arc(tx + px(6), ty + px(10), px(4.2), 0, Math.PI * 2);
  ctx.fillStyle = METAL;
  ctx.fill();
  ctx.strokeStyle = rgba("#2a2c30", 0.45);
  ctx.lineWidth = Math.max(1, px(0.8));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + phase * 0.15;
    ctx.beginPath();
    ctx.moveTo(tx + px(6), ty + px(10));
    ctx.lineTo(tx + px(6) + Math.cos(a) * px(4.2), ty + px(10) + Math.sin(a) * px(4.2));
    ctx.stroke();
  }

  // 頭（無地の木）
  ctx.beginPath();
  ctx.ellipse(tx, ty - px(12), px(7.2), px(8), 0, 0, Math.PI * 2);
  ctx.fillStyle = WOOD_A;
  ctx.fill();
  ctx.strokeStyle = WOOD_B;
  ctx.lineWidth = Math.max(1, px(1.1));
  ctx.stroke();
  ctx.fillStyle = WOOD_B;
  ctx.fillRect(tx - px(2), ty - px(5), px(4), px(4));

  // 腕と盆
  const trayX = x + 10 + reach;
  const trayY = bodyY + 6 + tiltY * 8;
  ctx.strokeStyle = WOOD_A;
  ctx.lineWidth = Math.max(2, px(2.6));
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(tx + px(8), ty + px(4));
  ctx.lineTo(view.sx(trayX - 6), view.sy(trayY));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tx + px(4), ty + px(8));
  ctx.lineTo(view.sx(trayX - 4), view.sy(trayY + 3));
  ctx.stroke();

  ctx.save();
  ctx.translate(view.sx(trayX), view.sy(trayY));
  ctx.rotate(tiltX * 0.35);
  ctx.fillStyle = TRAY;
  ctx.beginPath();
  ctx.ellipse(0, 0, px(20 + Math.abs(tiltX) * 2), px(7), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba("#e4d8c4", 0.8);
  ctx.lineWidth = Math.max(1.2, px(1.4));
  ctx.stroke();
  ctx.restore();

  const lift = Number(fx?.placeLift) || 0;
  const tea = clamp01(state?.tea);
  drawCup(
    ctx,
    view,
    trayX + sloshX * 5,
    trayY - 6 + sloshY * 3,
    tea,
    sloshX,
    sloshY,
    !!state?.spilled,
    lift,
  );

  ctx.restore();
}

function drawPathStrip(ctx, x, y, w, h, state, opts = {}) {
  const showPos = opts.showPos !== false;
  ctx.fillStyle = TATAMI_A;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = HERIBORDER;
  ctx.lineWidth = Math.max(1, h * 0.06);
  ctx.strokeRect(x, y, w, h);

  const mapX = (pos) => x + clamp01(pos) * w;
  for (const seam of seamsOf(state)) {
    const s = Number(seam?.s);
    const sw = Number(seam?.w) || 0.016;
    if (!Number.isFinite(s)) continue;
    const cx = mapX(s);
    const bw = Math.max(3, sw * w * 2.4);
    ctx.fillStyle = SEAM;
    ctx.fillRect(cx - bw / 2, y + 2, bw, h - 4);
    ctx.strokeStyle = PILLAR_B;
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - bw / 2, y + 2, bw, h - 4);
  }
  const prog = Array.isArray(state?.seatProg) ? state.seatProg : [];
  seatsOf(state).forEach((seat, i) => {
    const a = mapX(seat.s0);
    const b = mapX(seat.s1);
    ctx.fillStyle = prog[i]?.served ? rgba(ZABUTON, 0.95) : ZABUTON;
    ctx.fillRect(a, y + h * 0.18, Math.max(4, b - a), h * 0.64);
    ctx.strokeStyle = "#3a1010";
    ctx.lineWidth = 1;
    ctx.strokeRect(a, y + h * 0.18, Math.max(4, b - a), h * 0.64);
  });
  if (showPos) {
    const pos = Number(state?.pos);
    if (Number.isFinite(pos)) {
      const px = mapX(pos);
      ctx.fillStyle = WOOD_A;
      ctx.beginPath();
      ctx.arc(px, y + h / 2, Math.max(3, h * 0.28), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = WOOD_B;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }
}

function drawMinimap(ctx, view, state) {
  const box = MINIMAP;
  const x = view.sx(box.x);
  const y = view.sy(box.y);
  const w = view.px(box.w);
  const h = view.px(box.h);
  ctx.save();
  ctx.fillStyle = rgba(HUD_BG, 0.94);
  ctx.strokeStyle = rgba(PILLAR_A, 0.7);
  ctx.lineWidth = Math.max(1, view.px(1.2));
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, 4);
  else ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = `700 ${Math.max(10, view.px(11))}px ${FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("廊下", x + view.px(8), y + h / 2);

  const labelW = view.px(36);
  drawPathStrip(ctx, x + labelW, y + view.px(10), w - labelW - view.px(8), h - view.px(20), state);
  ctx.restore();
}

function drawRevealOverlay(ctx, view, state, fx) {
  ctx.save();
  ctx.fillStyle = rgba("#1c2430", 0.18);
  ctx.fillRect(view.sx(0), view.sy(0), view.px(VIEW_W), view.px(VIEW_H));
  drawSeams(ctx, view, state);
  drawSeats(ctx, view, state);

  const trail = Array.isArray(fx?.trail) ? fx.trail : [];
  const reduced = !!view.reducedMotion;
  if (trail.length >= 2) {
    ctx.beginPath();
    for (let i = 0; i < trail.length; i++) {
      const p = trail[i];
      const x = view.sx(hallX(p.pos));
      const y = view.sy(HALL_FLOOR - 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = rgba(WOOD_A, 0.95);
    ctx.lineWidth = Math.max(2.2, view.px(2.6));
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i < trail.length; i++) {
      const p = trail[i];
      const x = view.sx(hallX(p.pos) + (Number(p.sloshX) || 0) * 10 + (Number(p.tiltX) || 0) * 6);
      const y = view.sy(HALL_FLOOR - 18 - (Number(p.sloshY) || 0) * 8);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = rgba(TEA, 0.9);
    ctx.lineWidth = Math.max(1.8, view.px(2));
    ctx.stroke();

    if (!reduced) {
      for (let i = 0; i < trail.length; i += 3) {
        const p = trail[i];
        const side = (i / 3) % 2 === 0 ? -1 : 1;
        ctx.fillStyle = rgba(WOOD_B, 0.45);
        ctx.beginPath();
        ctx.ellipse(
          view.sx(hallX(p.pos) + side * 3),
          view.sy(HALL_FLOOR + 2),
          view.px(4.2),
          view.px(2),
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

/**
 * タイトルの廊下の縮小図。席と段差は見せ、配置の解説も数値も出さない。
 * @param {HTMLCanvasElement} canvas
 * @param {object} state
 */
export function drawTitlePreview(canvas, state) {
  if (!canvas || typeof canvas.getContext !== "function") return;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = Math.max(1, canvas.clientWidth || 240);
  const cssH = Math.max(1, canvas.clientHeight || 100);
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = HUD_BG;
  ctx.fillRect(0, 0, cssW, cssH);
  const pad = 10;
  drawPathStrip(ctx, pad, cssH * 0.28, cssW - pad * 2, cssH * 0.48, state, { showPos: false });
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state
 * @param {{ reducedMotion?: boolean, fx?: object, left?: object, right?: object }} [opts]
 */
export function drawScene(ctx, state, opts = {}) {
  const canvas = ctx.canvas;
  const { cssW, cssH, dpr } = syncCanvasSize(canvas);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const base = makeView(cssW, cssH);
  const reduced = !!opts.reducedMotion;
  const fx = opts.fx;
  const zoom = revealZoom(fx, reduced);
  const midX = hallX(Number(state?.pos) || 0.02);
  const view =
    zoom === 1
      ? base
      : {
          ...base,
          sx(x) {
            return base.sx(midX + (x - midX) * zoom);
          },
          sy(y) {
            return base.sy(HALL_FLOOR + (y - HALL_FLOOR) * zoom);
          },
          px(wu) {
            return base.px(wu * zoom);
          },
        };

  fillWall(ctx, base);
  drawRoom(ctx, view, fx, reduced);
  drawCorridor(ctx, view, state, { reducedMotion: reduced });

  const playing = state?.status === "playing";
  const phase = state?.phase;
  const showControls = playing && phase !== "reveal";

  if (showControls) {
    drawLever(ctx, view, state, fx);
    drawTrayPad(ctx, view, state);
    const leftPos = leftThumbPos(opts.left, state);
    const rightPos = rightThumbPos(opts.right, state);
    drawThumbGuide(ctx, view, leftPos.x, leftPos.y, leftPos.active, !!state?.hintLeft);
    drawThumbGuide(ctx, view, rightPos.x, rightPos.y, rightPos.active, !!state?.hintRight);
    drawMotionGuides(ctx, view, state);
  }

  // からくりと今の盆・茶碗は指より手前
  if (state?.status !== "over") drawDoll(ctx, view, state, fx);

  if (playing && phase !== "reveal") drawMinimap(ctx, base, state);
  if (playing && phase === "reveal") {
    drawRevealOverlay(ctx, view, state, fx);
    drawMinimap(ctx, base, state);
  }

  drawFx(ctx, fx, { ...view, reducedMotion: reduced }, state);
}
