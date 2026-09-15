import { ITEM_CATALOG } from './catalog';
import type { InventoryResult, InventorySnapshot, ItemId, ItemStack } from './types';
import { capacityWithModifier, mergeStack, removeStack, stackWeight, validQuantity } from './rules';
import type { Point } from '../types';
import { tileKey } from '../worldCoordinates';

export function createInventory(
  capacityGrams: number,
  initial: readonly ItemStack[] = [],
  capacityModifier = 0
) {
  let stacks = initial.filter((s) => s.quantity > 0).map((s) => ({ ...s }));
  let revision = 0;
  const weight = () => stackWeight(stacks);
  const capacity = () => capacityWithModifier(capacityGrams, capacityModifier);
  const snapshot = (): InventorySnapshot => ({
    stacks: stacks.map((s) => ({ ...s })),
    weightGrams: weight(),
    capacityGrams: capacity(),
    revision
  });
  const add = (id: ItemId, quantity: number): InventoryResult => {
    if (!validQuantity(quantity)) return { ok: false, error: 'invalid-quantity' };
    if (weight() + ITEM_CATALOG[id].weightGrams * quantity > capacity())
      return { ok: false, error: 'over-capacity' };
    stacks = mergeStack(stacks, id, quantity);
    revision++;
    return { ok: true, revision };
  };
  const remove = (id: ItemId, quantity: number): InventoryResult => {
    if (!validQuantity(quantity)) return { ok: false, error: 'invalid-quantity' };
    const next = removeStack(stacks, id, quantity);
    if (!next) return { ok: false, error: 'missing-item' };
    stacks = next;
    revision++;
    return { ok: true, revision };
  };
  return {
    snapshot,
    add,
    remove,
    setCapacityModifier: (modifier: number) => {
      capacityModifier = modifier;
      revision++;
    },
    get revision() {
      return revision;
    }
  };
}

/** Session-only owner for inventories and ground stacks. */
export function createInventoryService() {
  const inventories = new Map<string, ReturnType<typeof createInventory>>();
  const ground = new Map<string, ItemStack[]>();
  const register = (id: string, capacity: number, initial: readonly ItemStack[]) => {
    const inventory = createInventory(capacity, initial);
    inventories.set(id, inventory);
    return inventory;
  };
  const drop = (actorId: string, point: Point, id: ItemId, quantity: number): InventoryResult => {
    const source = inventories.get(actorId);
    if (!source) return { ok: false, error: 'unavailable' };
    const result = source.remove(id, quantity);
    if (!result.ok) return result;
    const key = tileKey(point);
    ground.set(key, mergeStack(ground.get(key) ?? [], id, quantity));
    return result;
  };
  return {
    register,
    unregister: (id: string) => inventories.delete(id),
    inventory: (id: string) => inventories.get(id),
    groundAt: (point: Point) => (ground.get(tileKey(point)) ?? []).map((s) => ({ ...s })),
    drop
  };
}
