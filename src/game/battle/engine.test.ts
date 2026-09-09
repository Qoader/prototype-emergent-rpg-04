import { describe, expect, it } from 'vitest';
import { applyBattleCommand, createBattle } from './engine';

describe('battle engine', () => {
  it('moves orthogonally and spends movement points', () => {
    const state = createBattle('goblin-1');
    const transition = applyBattleCommand(state, { kind: 'move', actorId: 'player', destination: { col: 3, row: 4 } });
    expect('error' in transition).toBe(false);
    if ('error' in transition) return;
    expect(transition.state.combatants.player.position).toEqual({ col: 3, row: 4 });
    expect(transition.state.combatants.player.mp).toBe(2);
    expect(transition.events[0]).toMatchObject({ kind: 'move', path: [{ col: 2, row: 4 }, { col: 3, row: 4 }] });
  });

  it('allows a lethal adjacent attack and emits a terminal result', () => {
    const state = createBattle('goblin-1');
    state.combatants.player.position = { col: 5, row: 4 };
    state.combatants.player.ap = 1;
    state.combatants['goblin-1']!.hp = 4;
    const transition = applyBattleCommand(state, { kind: 'attack', actorId: 'player', targetId: 'goblin-1' });
    expect('error' in transition).toBe(false);
    if ('error' in transition) return;
    expect(transition.state.outcome).toBe('victory');
    expect(transition.events.at(-1)).toEqual({ kind: 'finished', outcome: 'victory' });
  });

  it('refreshes the next actor and rejects commands out of turn', () => {
    const state = createBattle('goblin-1');
    const invalid = applyBattleCommand(state, { kind: 'attack', actorId: 'goblin-1', targetId: 'player' });
    expect('error' in invalid).toBe(true);
    const transition = applyBattleCommand(state, { kind: 'end-turn', actorId: 'player' });
    expect(transition.state.activeId).toBe('goblin-1');
  });
});
