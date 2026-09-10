import { describe, expect, it } from 'vitest';
import {
  animationFrame,
  battleSurfacePixelSize,
  clampBattleCameraAxis,
  combatantPose,
  revealBattleCameraAxis,
  spriteFootPosition,
  BATTLE_RENDER_PADDING,
  BATTLE_SCALE,
  BATTLE_TILE_SIZE
} from './battleRendering';
import { createBattle } from './battle/engine';

describe('battle rendering coordinates', () => {
  it('anchors a stationary actor’s feet inside its occupied cell', () => {
    const state = createBattle('goblin');
    const foot = spriteFootPosition(combatantPose(state, state.combatants.player));
    expect(foot).toEqual({ x: 2.5 * BATTLE_TILE_SIZE, y: 5 * BATTLE_TILE_SIZE - 5 });
    expect(BATTLE_SCALE).toBe(1);
  });

  it('uses typed visual facing and elapsed time for walking frames', () => {
    const state = createBattle('goblin');
    state.visual = { player: { x: 2.75, y: 4.5, facing: 'east', moving: true, elapsed: 0.31 } };
    const pose = combatantPose(state, state.combatants.player);
    expect(pose.facing).toBe('east');
    expect(spriteFootPosition(pose)).toEqual({ x: 132, y: 235 });
    expect(animationFrame(pose)).toBe(3);
    expect(animationFrame({ ...pose, moving: false })).toBe(0);
  });

  it('adds drawing padding without changing the logical grid dimensions', () => {
    const state = createBattle('goblin');
    expect(battleSurfacePixelSize(state)).toEqual({
      width: state.width * BATTLE_TILE_SIZE + BATTLE_RENDER_PADDING * 2,
      height: state.height * BATTLE_TILE_SIZE + BATTLE_RENDER_PADDING * 2
    });
  });

  it('rounds only displayed foot positions, leaving the visual pose intact', () => {
    const pose = { x: 2.5101, y: 4.5001, facing: 'east' as const, moving: true, elapsed: 0.31 };
    expect(spriteFootPosition(pose)).toEqual({ x: 120, y: 235 });
    expect(pose).toEqual({ x: 2.5101, y: 4.5001, facing: 'east', moving: true, elapsed: 0.31 });
  });

  it('centers or clamps the padded surface on integer camera pixels', () => {
    expect(clampBattleCameraAxis(-3.4, 600, 496)).toBe(52);
    expect(clampBattleCameraAxis(-600.6, 320, 496)).toBe(-176);
    expect(clampBattleCameraAxis(3.6, 320, 496)).toBe(0);
  });

  it('reveals a focus target including its drawing allowance', () => {
    expect(revealBattleCameraAxis(0, 160, 496, 328, 392)).toBe(-232);
    expect(revealBattleCameraAxis(-240, 160, 496, 0, 64)).toBe(0);
  });
});
