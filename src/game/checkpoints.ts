import type { Point, Settlement, TileReader } from './types';
export function createCheckpointTracker(spawn: Point, settlements: readonly Settlement[], tiles: TileReader) {
  let current: string | null = null; let last: { settlementId: string; tile: Point } | null = null;
  const settlementAt = (p: Point) => { const id = tiles.getTile(p)?.settlementId; return id ? settlements.find((s) => s.id === id) : undefined; };
  const visit = (p: Point) => { const s = settlementAt(p); if (!s) { current = null; return; } if (current !== s.id) { current = s.id; last = { settlementId: s.id, tile: { ...p } }; } };
  visit(spawn);
  const resolve = () => { if (!last) return { ...spawn }; const s = settlements.find((x) => x.id === last!.settlementId); if (!s) return { ...spawn }; const valid = (p: Point) => Boolean(tiles.getTile(p)?.walkable && tiles.getTile(p)?.settlementId === s.id); if (valid(last.tile)) return { ...last.tile }; let best: Point | null = null; let score = Infinity; for (let row = s.bounds.top; row <= s.bounds.bottom; row++) for (let col = s.bounds.left; col <= s.bounds.right; col++) { const p = { col, row }; if (!valid(p)) continue; const d = Math.abs(col - last.tile.col) + Math.abs(row - last.tile.row); if (d < score || (d === score && (best === null || row < best.row || (row === best.row && col < best.col)))) { best = p; score = d; } } return best ?? { ...spawn }; };
  return { visit, resolve, get checkpoint() { return last ? { settlementId: last.settlementId, tile: { ...last.tile } } : null; } };
}
