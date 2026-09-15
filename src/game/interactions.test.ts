import { describe, expect, it, vi } from 'vitest';
import {
  advanceSearch,
  openTileActions,
  SEARCH_DURATION_SECONDS,
  searchResultMessage,
  startSearch
} from './interactions';

describe('tile interactions', () => {
  it('requires five active seconds and discovers each ground item independently', () => {
    const random = vi.fn(() => 0.7);
    const started = startSearch(openTileActions({ col: 2, row: 3 }, true));
    expect(
      advanceSearch(
        started,
        SEARCH_DURATION_SECONDS - 0.01,
        [{ id: 'ration', quantity: 2 }],
        random
      )
    ).toMatchObject({ kind: 'searching' });
    expect(
      advanceSearch(
        started,
        SEARCH_DURATION_SECONDS,
        [
          { id: 'ration', quantity: 2 },
          { id: 'stone', quantity: 1 }
        ],
        random
      )
    ).toEqual({
      kind: 'results',
      tile: { col: 2, row: 3 },
      found: [
        { id: 'ration', quantity: 2 },
        { id: 'stone', quantity: 1 }
      ],
      foundAny: true
    });
  });

  it('does not offer actions on an unavailable tile', () => {
    expect(openTileActions({ col: 1, row: 1 }, false)).toEqual({ kind: 'none' });
  });

  it('distinguishes an empty search from collected discoveries', () => {
    expect(
      searchResultMessage({ kind: 'results', tile: { col: 0, row: 0 }, found: [], foundAny: false })
    ).toBe('Nothing found.');
    expect(
      searchResultMessage({ kind: 'results', tile: { col: 0, row: 0 }, found: [], foundAny: true })
    ).toBe('No discovered items remaining.');
  });
});
