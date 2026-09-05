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

  it('advances at a fixed speed and consumes complete route steps', () => {
    const state = createMovement({ col: 2, row: 2 });
    state.route = [{ col: 3, row: 2 }, { col: 4, row: 2 }];
    state.destination = { col: 4, row: 2 };

    advanceMovement(state, 1 / 6);
    expect(state.position).toEqual({ x: 3.5, y: 2.5 });
    expect(state.tile).toEqual({ col: 3, row: 2 });
    expect(state.route).toEqual([{ col: 4, row: 2 }]);
    expect(state.destination).toEqual({ col: 4, row: 2 });

    advanceMovement(state, 1 / 6);
    expect(state.position).toEqual({ x: 4.5, y: 2.5 });
    expect(state.tile).toEqual({ col: 4, row: 2 });
    expect(state.route).toEqual([]);
    expect(state.destination).toBeNull();
  });

  it('clamps negative time and leaves idle movement unchanged', () => {
    const state = createMovement({ col: 4, row: 7 });
    const before = structuredClone(state);
    advanceMovement(state, -10);
    expect(state).toEqual(before);
    advanceMovement(state, 0);
    expect(state).toEqual(before);
  });

  it('supports fractional progress without changing the logical tile early', () => {
    const state = createMovement({ col: 0, row: 0 });
    state.route = [{ col: 0, row: 1 }];
    state.destination = { col: 0, row: 1 };
    advanceMovement(state, 0.05);
    expect(state.position.y).toBeGreaterThan(0.5);
    expect(state.position.y).toBeLessThan(1.5);
    expect(state.tile).toEqual({ col: 0, row: 0 });
    expect(state.destination).toEqual({ col: 0, row: 1 });
  });
});
