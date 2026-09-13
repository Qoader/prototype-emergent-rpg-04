import { describe, expect, it } from 'vitest';
import { createWorldBattleView, sampleWorldBattleAnimation, worldBattlePhaseOffset } from './worldBattleRendering';
import type { BattleSummary } from './worldBattles';

const summary = (overrides: Partial<BattleSummary> = {}): BattleSummary => ({
  id: 'battle-3',
  tile: { col: 2, row: 4 },
  adventurers: 1,
  goblins: 1,
  playerParticipating: false,
  representatives: {
    allied: { id: 'adventurer-1', kind: 'adventurer' },
    opposing: { id: 'goblin-1', kind: 'goblin' }
  },
  clashing: true,
  ...overrides
});

describe('world battle animation', () => {
  it('has stable rest, smooth lunge, synchronized impact, and recoil', () => {
    const rest = sampleWorldBattleAnimation(0, 0, true);
    const lunge = sampleWorldBattleAnimation(.325, 0, true);
    const impact = sampleWorldBattleAnimation(.45, 0, true);
    const recoil = sampleWorldBattleAnimation(.675, 0, true);
    expect(rest).toMatchObject({ separation: 24, moving: false, sparkAlpha: 0 });
    expect(lunge.moving).toBe(true);
    expect(lunge.separation).toBeLessThan(24);
    expect(impact).toMatchObject({ separation: 18, moving: false, sparkAlpha: 1 });
    expect(impact.swordOpeningDegrees).toBe(0);
    expect(recoil.moving).toBe(true);
    expect(recoil.separation).toBeGreaterThan(18);
    expect(sampleWorldBattleAnimation(1.45, 0, true)).toEqual(impact);
  });

  it('holds inactive battles at rest and gives each ID a deterministic phase', () => {
    expect(sampleWorldBattleAnimation(.45, 0, false)).toMatchObject({
      separation: 24,
      moving: false,
      sparkAlpha: 0
    });
    expect(worldBattlePhaseOffset('battle-1')).toBe(worldBattlePhaseOffset('battle-1'));
    expect(worldBattlePhaseOffset('battle-1')).not.toBe(worldBattlePhaseOffset('battle-2'));
  });

  it('uses full-size inward-facing sprites at tile-relative positions and is safely disposable', () => {
    const view = createWorldBattleView(summary());
    view.update(summary(), .45 - worldBattlePhaseOffset('battle-3'));
    expect(view.fighters.position).toMatchObject({ x: 120, y: 228 });
    expect(view.fighters.children).toHaveLength(2);
    expect(view.fighters.children.map((child) => child.position.x)).toEqual([-18, 18]);
    expect(view.fighters.children.every((child) => child.scale.x === 1 && child.scale.y === 1)).toBe(true);
    expect(view.overlay.position).toMatchObject({ x: 120, y: 228 });
    view.update(summary({ representatives: { allied: { id: 'player', kind: 'player' }, opposing: null }, clashing: false }), .5);
    expect(view.fighters.children).toHaveLength(1);
    expect(() => { view.destroy(); view.destroy(); }).not.toThrow();
  });
});
