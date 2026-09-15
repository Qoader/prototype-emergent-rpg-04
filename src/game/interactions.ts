import type { ItemId, ItemStack } from './inventory/types';
import type { Point } from './types';

export const SEARCH_DURATION_SECONDS = 5;

export type InteractionState =
  | { kind: 'none' }
  | { kind: 'menu'; tile: Point }
  | { kind: 'searching'; tile: Point; elapsed: number }
  | { kind: 'results'; tile: Point; found: ItemStack[]; foundAny: boolean };

export type RandomSource = () => number;

export const noInteraction = (): InteractionState => ({ kind: 'none' });
export const openTileActions = (tile: Point, walkable: boolean): InteractionState =>
  walkable ? { kind: 'menu', tile: { ...tile } } : noInteraction();
export const startSearch = (state: InteractionState): InteractionState =>
  state.kind === 'menu' || state.kind === 'results'
    ? { kind: 'searching', tile: { ...state.tile }, elapsed: 0 }
    : state;
export const advanceSearch = (
  state: InteractionState,
  seconds: number,
  ground: readonly ItemStack[],
  random: RandomSource
): InteractionState => {
  if (state.kind !== 'searching') return state;
  const elapsed = state.elapsed + Math.max(0, seconds);
  if (elapsed + 1e-9 < SEARCH_DURATION_SECONDS) return { ...state, elapsed };
  const quantities = new Map<ItemId, number>();
  // Each unit is independently discoverable; grouping is only presentation.
  for (const stack of ground)
    for (let index = 0; index < stack.quantity; index++)
      if (random() < 0.75) quantities.set(stack.id, (quantities.get(stack.id) ?? 0) + 1);
  return {
    kind: 'results',
    tile: { ...state.tile },
    found: [...quantities.entries()].map(([id, quantity]) => ({ id, quantity })),
    foundAny: quantities.size > 0
  };
};
export const searchResultMessage = (state: Extract<InteractionState, { kind: 'results' }>) =>
  state.found.length ? '' : state.foundAny ? 'No discovered items remaining.' : 'Nothing found.';
