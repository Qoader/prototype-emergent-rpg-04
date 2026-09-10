import type { Facing } from './movement';
import type { BattleCombatant, BattleState } from './battle/types';

export const BATTLE_TILE_SIZE = 48;
/** Artwork is authored in CSS pixels: never shrink it to fit the board. */
export const BATTLE_SCALE = 1;
export const BATTLE_FOOT_INSET = 5;
/** Empty drawing space for feet-anchored artwork that overhangs a board edge. */
export const BATTLE_RENDER_PADDING = 8;

export type BattleVisualPose = {
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  elapsed?: number;
};

export const boardPixelSize = (state: Pick<BattleState, 'width' | 'height'>) => ({
  width: state.width * BATTLE_TILE_SIZE,
  height: state.height * BATTLE_TILE_SIZE,
});

export const battleSurfacePixelSize = (state: Pick<BattleState, 'width' | 'height'>) => {
  const board = boardPixelSize(state);
  return {
    width: board.width + BATTLE_RENDER_PADDING * 2,
    height: board.height + BATTLE_RENDER_PADDING * 2,
  };
};

export function combatantPose(state: BattleState, combatant: BattleCombatant): BattleVisualPose {
  const visual = state.visual?.[combatant.id];
  return {
    x: visual?.x ?? combatant.position.col + 0.5,
    y: visual?.y ?? combatant.position.row + 0.5,
    facing: visual?.facing ?? 'south',
    moving: visual?.moving ?? false,
    elapsed: visual?.elapsed,
  };
}

export function spriteFootPosition(pose: BattleVisualPose) {
  return {
    // Quantize only the final display position. Simulation coordinates remain
    // fractional so movement timing and routes do not accumulate rounding error.
    x: Math.round(pose.x * BATTLE_TILE_SIZE),
    y: Math.round((pose.y + 0.5) * BATTLE_TILE_SIZE - BATTLE_FOOT_INSET),
  };
}

export const animationFrame = (pose: BattleVisualPose) =>
  pose.moving ? Math.floor((pose.elapsed ?? 0) * 10) % 4 : 0;

export function clampBattleCameraAxis(
  requested: number,
  viewportExtent: number,
  surfaceExtent: number
) {
  if (viewportExtent >= surfaceExtent) return Math.round((viewportExtent - surfaceExtent) / 2);
  const clamped = Math.max(viewportExtent - surfaceExtent, Math.min(0, Math.round(requested)));
  return Object.is(clamped, -0) ? 0 : clamped;
}

/** Moves one axis only as much as needed to reveal an interval in surface space. */
export function revealBattleCameraAxis(
  camera: number,
  viewportExtent: number,
  surfaceExtent: number,
  targetStart: number,
  targetEnd: number
) {
  let requested = camera;
  if (targetEnd - targetStart > viewportExtent)
    requested = viewportExtent / 2 - (targetStart + targetEnd) / 2;
  else {
    const visibleStart = -camera;
    const visibleEnd = visibleStart + viewportExtent;
    if (targetStart < visibleStart) requested = -targetStart;
    else if (targetEnd > visibleEnd) requested = viewportExtent - targetEnd;
  }
  return clampBattleCameraAxis(requested, viewportExtent, surfaceExtent);
}
