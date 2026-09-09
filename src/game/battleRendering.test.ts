import { describe, expect, it } from 'vitest';
import { animationFrame, combatantPose, spriteFootPosition, BATTLE_SCALE, BATTLE_TILE_SIZE } from './battleRendering';
import { createBattle } from './battle/engine';

describe('battle rendering coordinates', () => {
  it('anchors a stationary actor’s feet inside its occupied cell', () => {
    const state = createBattle('goblin');
    const foot = spriteFootPosition(combatantPose(state, state.combatants.player));
    expect(foot).toEqual({ x: 2.5 * BATTLE_TILE_SIZE, y: 5 * BATTLE_TILE_SIZE - 5 });
    expect(BATTLE_SCALE).toBeGreaterThan(0);
  });

  it('uses typed visual facing and elapsed time for walking frames', () => {
    const state = createBattle('goblin');
    state.visual = { player: { x: 2.75, y: 4.5, facing: 'east', moving: true, elapsed: 0.31 } };
    const pose = combatantPose(state, state.combatants.player);
    expect(pose.facing).toBe('east');
    expect(spriteFootPosition(pose)).toEqual({ x: 2.75 * 48, y: 5 * 48 - 5 });
    expect(animationFrame(pose)).toBe(3);
    expect(animationFrame({ ...pose, moving: false })).toBe(0);
  });
});
