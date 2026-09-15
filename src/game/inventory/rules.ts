export { ITEM_CATALOG } from './catalog';
import { ITEM_CATALOG } from './catalog';
import type { ItemId, ItemStack } from './types';
export const kilograms = (grams: number) => `${(grams / 1000).toFixed(grams % 1000 ? 1 : 0)} kg`;
export const validQuantity = (quantity: number) => Number.isInteger(quantity) && quantity > 0;
export const stackWeight = (stacks: readonly ItemStack[]) =>
  stacks.reduce((total, stack) => total + ITEM_CATALOG[stack.id].weightGrams * stack.quantity, 0);
export const capacityWithModifier = (base: number, modifier = 0) => Math.max(0, base + modifier);
export const mergeStack = (
  stacks: readonly ItemStack[],
  id: ItemId,
  quantity: number
): ItemStack[] => {
  const copy = stacks.map((s) => ({ ...s }));
  const existing = copy.find((s) => s.id === id);
  if (existing) existing.quantity += quantity;
  else copy.push({ id, quantity });
  return copy;
};
export const removeStack = (
  stacks: readonly ItemStack[],
  id: ItemId,
  quantity: number
): ItemStack[] | null => {
  const current = stacks.find((s) => s.id === id);
  if (!current || current.quantity < quantity) return null;
  return stacks.flatMap((s) =>
    s.id !== id
      ? [{ ...s }]
      : s.quantity === quantity
        ? []
        : [{ ...s, quantity: s.quantity - quantity }]
  );
};
