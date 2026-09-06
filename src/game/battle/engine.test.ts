import { describe, expect, it } from 'vitest';
import { applyBattleCommand, createBattle } from './engine';
import { reachable } from './grid';

describe('battle engine', () => {
  it('moves orthogonally and spends movement points', () => {
    const state = createBattle('goblin-1');
    const transition = applyBattleCommand(state, { kind: 'move', actorId: 'player', destination: { col: 2, row: 4 } });
    expect('error' in transition).toBe(false);
    if ('error' in transition) return;
    expect(transition.state.combatants.player.position).toEqual({ col: 2, row: 4 });
    expect(transition.state.combatants.player.mp).toBe(1);
    expect(reachable(transition.state, 'player').has('5,3')).toBe(false);
  });

  it('allows a lethal adjacent attack and emits a terminal result', () => {
    const state = createBattle('goblin-1');
    state.combatants.player.position = { col: 4, row: 3 };
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
