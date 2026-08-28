import { describe, expect, it } from 'vitest';
import { advanceMovement, createMovement } from './movement';

describe('movement facing', () => {
  it('starts facing south and updates for cardinal movement', () => {
    const state = createMovement({ col: 2, row: 2 });
    expect(state.facing).toBe('south');
    state.route = [{ col: 1, row: 2 }];
    advanceMovement(state, 0.01);
    expect(state.facing).toBe('west');
  });

  it('uses horizontal facing for diagonal segments and retains it at rest', () => {
    const state = createMovement({ col: 2, row: 2 });
    state.route = [{ col: 3, row: 3 }];
    advanceMovement(state, 0.01);
    expect(state.facing).toBe('east');
    advanceMovement(state, 1);
    expect(state.destination).toBeNull();
    expect(state.facing).toBe('east');
  });
});
