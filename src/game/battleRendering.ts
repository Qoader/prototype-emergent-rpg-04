import type { Facing } from './movement';
import type { BattleCombatant, BattleState } from './battle/types';

export const BATTLE_TILE_SIZE = 48;
export const BATTLE_SCALE = 0.9;
export const BATTLE_FOOT_INSET = 5;

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
    x: pose.x * BATTLE_TILE_SIZE,
    y: (pose.y + 0.5) * BATTLE_TILE_SIZE - BATTLE_FOOT_INSET,
  };
}

export const animationFrame = (pose: BattleVisualPose) =>
  pose.moving ? Math.floor((pose.elapsed ?? 0) * 10) % 4 : 0;
