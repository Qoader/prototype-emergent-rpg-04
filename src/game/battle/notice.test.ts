import { describe, expect, it } from 'vitest';
import { initialBattleNotice, reduceBattleNotice } from './notice';

describe('battle notice presentation reducer', () => {
  it('summarizes actions and ignores bare handoffs', () => {
    const initial = initialBattleNotice();
    const moved = reduceBattleNotice(initial, [{ kind: 'move', actorId: 'player', from: { col: 2, row: 4 }, to: { col: 3, row: 4 }, cost: 1, path: [{ col: 2, row: 4 }, { col: 3, row: 4 }] }]);
    expect(moved.message).toContain('cost 1 MP');
    expect(reduceBattleNotice(moved, [{ kind: 'turn-start', actorId: 'goblin', turn: 1 }])).toBe(moved);
  });
  it('does not revise for empty animation/rejected batches', () => {
    const initial = initialBattleNotice();
    expect(reduceBattleNotice(initial, [])).toBe(initial);
  });
});
