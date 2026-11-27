/** 茶運びからくり: 左手は溝を下へ進み上で止まり、右手は盆の中心に置く。 */
import * as C from "../engine/constants.mjs";
import {
  drawHoldGuide,
  drawTravelGuide,
  guideNow,
  pathLine,
  prefersReducedMotion,
} from "./motion-guide.mjs";

const LEVER_CX = C.LEVER_CX ?? 188;
const GAIT_Y0 = C.GAIT_Y0 ?? 168;
const GAIT_SPAN = C.GAIT_SPAN ?? 200;
const TRAY_CX = C.TRAY_CX ?? 648;
const TRAY_CY = C.TRAY_CY ?? 268;
const LEVEL_RAD = C.LEVEL_RAD ?? 36;

export function drawMotionGuides(ctx, view, state) {
  if (state?.status !== "playing") return;
  if (state.phase === "reveal") return;
  const reduced = prefersReducedMotion();
  const t = guideNow();
  if (state.hintLeft !== false) {
    const pts = pathLine(LEVER_CX, GAIT_Y0 + 6, LEVER_CX, GAIT_Y0 + GAIT_SPAN - 12, 18);
    drawTravelGuide(ctx, view, pts, t, { period: 2.5, loop: "pingpong", reduced, alpha: 0.5 });
  }
  if (state.hintRight !== false) {
    drawHoldGuide(ctx, view, TRAY_CX, TRAY_CY, t, {
      reduced,
      ring: LEVEL_RAD + 2,
      arrows: 4,
      alpha: 0.46,
      thumbR: 17,
    });
  }
}
