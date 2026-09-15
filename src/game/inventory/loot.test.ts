import { describe, expect, it } from 'vitest';
import { deterministicLoot, rollLoot } from './loot';
describe('deterministic loot', () =>
  it('is repeatable without mutating input', () => {
    const items = [
      { id: 'stone' as const, quantity: 3 },
      { id: 'ration' as const, quantity: 2 }
    ];
    expect(deterministicLoot(7, 'battle-1', 'goblin-a', items)).toEqual(
      deterministicLoot(7, 'battle-1', 'goblin-a', items)
    );
    expect(items[0].quantity).toBe(3);
  }));
it('supports exact injected rolls in stable item order', () => {
  expect(
    rollLoot(
      [
        { id: 'stone', quantity: 1 },
        { id: 'bandage', quantity: 2 }
      ],
      () => 0
    )
  ).toEqual([
    { id: 'bandage', quantity: 2 },
    { id: 'stone', quantity: 1 }
  ]);
  expect(rollLoot([{ id: 'ration', quantity: 2 }], () => 1)).toEqual([]);
});
