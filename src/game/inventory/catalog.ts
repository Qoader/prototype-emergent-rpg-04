import type { ItemId } from './types';
export type ItemDefinition = {
  id: ItemId;
  name: string;
  description: string;
  weightGrams: number;
  icon: string;
};
export const ITEM_CATALOG: Record<ItemId, ItemDefinition> = {
  ration: {
    id: 'ration',
    name: 'Ration',
    description: 'A compact day of trail food.',
    weightGrams: 500,
    icon: '🍞'
  },
  bandage: {
    id: 'bandage',
    name: 'Bandage',
    description: 'Clean cloth for tending wounds.',
    weightGrams: 100,
    icon: '🩹'
  },
  rope: {
    id: 'rope',
    name: 'Rope',
    description: 'A sturdy coil of hemp rope.',
    weightGrams: 2000,
    icon: '🪢'
  },
  stone: {
    id: 'stone',
    name: 'Stone',
    description: 'A heavy, ordinary stone.',
    weightGrams: 1000,
    icon: '🪨'
  }
};
