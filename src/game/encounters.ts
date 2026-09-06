import type { Point } from './types';
import type { GoblinSnapshot } from './goblins';
export function findGoblinContact(tile: Point, goblins: readonly Pick<GoblinSnapshot, 'id' | 'tile'>[]): string | null {
  let selected: string | null = null;
  for (const goblin of goblins) if (goblin.tile.col === tile.col && goblin.tile.row === tile.row && (selected === null || goblin.id.localeCompare(selected) < 0)) selected = goblin.id;
  return selected;
}
