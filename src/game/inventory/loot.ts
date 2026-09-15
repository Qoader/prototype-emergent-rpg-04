import type { ItemStack } from './types';
/** Stateless deterministic roll: never consumes world simulation randomness. */
export function deterministicLoot(
  seed: number,
  battleId: string,
  actorId: string,
  stacks: readonly ItemStack[]
): ItemStack[] {
  let h = (seed ^ 2166136261) >>> 0;
  for (const char of `${battleId}:${actorId}`)
    h = Math.imul(h ^ char.charCodeAt(0), 16777619) >>> 0;
  const next = () => {
    h = Math.imul(h ^ (h >>> 16), 2246822519) >>> 0;
    return (h >>> 0) / 0x100000000;
  };
  return rollLoot(stacks, next);
}
export function rollLoot(stacks: readonly ItemStack[], random: () => number): ItemStack[] {
  const out: ItemStack[] = [];
  for (const stack of [...stacks].sort((a, b) => a.id.localeCompare(b.id)))
    for (let i = 0; i < stack.quantity; i++)
      if (random() < 0.5) {
        const found = out.find((x) => x.id === stack.id);
        if (found) found.quantity++;
        else out.push({ id: stack.id, quantity: 1 });
      }
  return out;
}
