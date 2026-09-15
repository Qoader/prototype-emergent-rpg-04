export type ItemId = 'ration' | 'bandage' | 'rope' | 'stone';
export type ItemStack = { id: ItemId; quantity: number };
export type InventorySnapshot = {
  stacks: ItemStack[];
  weightGrams: number;
  capacityGrams: number;
  revision: number;
};
export type InventoryResult =
  | { ok: true; revision: number }
  | {
      ok: false;
      error: 'invalid-quantity' | 'missing-item' | 'over-capacity' | 'in-battle' | 'unavailable';
    };
