import type { Point } from './types';
import { tileKey } from './worldCoordinates';
import type { BattleId } from './worldBattles';

/** Player knowledge about places worth searching; deliberately independent of ground contents. */
export type SearchKnowledgeSnapshot = { revision: number; tiles: Point[] };

export function createSearchKnowledge() {
  const rememberedBattles = new Set<BattleId>();
  const marked = new Map<string, Point>();
  let revision = 0;
  const markTile = (tile: Readonly<Point>) => {
    const key = tileKey(tile);
    if (marked.has(key)) return false;
    marked.set(key, { ...tile });
    revision++;
    return true;
  };
  const clearTile = (tile: Readonly<Point>) => {
    if (!marked.delete(tileKey(tile))) return false;
    revision++;
    return true;
  };
  return {
    rememberBattle: (id: BattleId) => rememberedBattles.add(id),
    finishBattle: (id: BattleId, tile: Readonly<Point>) => {
      if (!rememberedBattles.delete(id)) return false;
      return markTile(tile);
    },
    markTile,
    completeSearch: (tile: Readonly<Point>, foundAny: boolean) =>
      foundAny ? markTile(tile) : clearTile(tile),
    snapshot: (): SearchKnowledgeSnapshot => ({
      revision,
      tiles: [...marked.values()].map((tile) => ({ ...tile }))
    })
  };
}
