import { describe, expect, it } from 'vitest';
import { createInventory, createInventoryService } from './store';

describe('inventory store', () => {
  it('keeps acquisition order, merges stacks, and re-appends after removal', () => {
    const inventory = createInventory(10000, [
      { id: 'ration', quantity: 1 },
      { id: 'rope', quantity: 1 }
    ]);
    inventory.add('ration', 2);
    expect(inventory.snapshot().stacks).toEqual([
      { id: 'ration', quantity: 3 },
      { id: 'rope', quantity: 1 }
    ]);
    inventory.remove('ration', 3);
    inventory.add('ration', 1);
    expect(inventory.snapshot().stacks.map((x) => x.id)).toEqual(['rope', 'ration']);
  });
  it('uses integer grams and keeps failed removals atomic', () => {
    const inventory = createInventory(600, [{ id: 'ration', quantity: 1 }]);
    expect(inventory.snapshot().weightGrams).toBe(500);
    expect(inventory.add('bandage', 2)).toMatchObject({ ok: false, error: 'over-capacity' });
    expect(inventory.remove('ration', 2)).toMatchObject({ ok: false, error: 'missing-item' });
    expect(inventory.snapshot().stacks).toEqual([{ id: 'ration', quantity: 1 }]);
  });
  it('uses additive capacity modifiers without rewriting carried weight', () => {
    const inventory = createInventory(500, [{ id: 'ration', quantity: 1 }], 100);
    expect(inventory.snapshot()).toMatchObject({ weightGrams: 500, capacityGrams: 600 });
    inventory.setCapacityModifier(-500);
    expect(inventory.snapshot()).toMatchObject({ weightGrams: 500, capacityGrams: 0 });
    expect(inventory.add('bandage', 1)).toMatchObject({ ok: false, error: 'over-capacity' });
  });
  it('transfers atomically and returns immutable merged ground', () => {
    const service = createInventoryService();
    service.register('a', 3000, [{ id: 'ration', quantity: 2 }]);
    expect(service.drop('a', { col: 1, row: 2 }, 'ration', 1)).toMatchObject({ ok: true });
    expect(service.drop('a', { col: 1, row: 2 }, 'ration', 2)).toMatchObject({ ok: false });
    const ground = service.groundAt({ col: 1, row: 2 });
    ground[0]!.quantity = 99;
    expect(service.groundAt({ col: 1, row: 2 })).toEqual([{ id: 'ration', quantity: 1 }]);
  });
});
