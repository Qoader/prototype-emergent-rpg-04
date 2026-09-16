import { describe, expect, it } from 'vitest';
import { createSearchKnowledge } from './searchKnowledge';

describe('search knowledge', () => {
  it('marks a remembered battle only when it finishes and consumes that memory', () => {
    const knowledge = createSearchKnowledge();
    knowledge.rememberBattle('battle-1');
    expect(knowledge.snapshot()).toEqual({ revision: 0, tiles: [] });
    expect(knowledge.finishBattle('battle-1', { col: 2, row: 3 })).toBe(true);
    expect(knowledge.snapshot()).toEqual({ revision: 1, tiles: [{ col: 2, row: 3 }] });
    expect(knowledge.finishBattle('battle-1', { col: 2, row: 3 })).toBe(false);
  });

  it('only changes revision when a cue enters or leaves the sparse tile set', () => {
    const knowledge = createSearchKnowledge();
    knowledge.markTile({ col: 1, row: 1 });
    knowledge.markTile({ col: 1, row: 1 });
    knowledge.completeSearch({ col: 1, row: 1 }, false);
    knowledge.completeSearch({ col: 1, row: 1 }, false);
    expect(knowledge.snapshot()).toEqual({ revision: 2, tiles: [] });
  });
});
