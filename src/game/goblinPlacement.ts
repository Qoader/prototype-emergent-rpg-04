import type { AuthoredTileEditor } from './authoredTiles';
import { isRoadSurface } from './domainTiles';
import type { GoblinNest, Point, Settlement, TileReader } from './types';
import { tileKey } from './worldCoordinates';

const NESTS_PER_SETTLEMENT = 3;
const MAX_ATTEMPTS = 512;
const directions = [-1, 0, 1].flatMap((row) => [-1, 0, 1].map((col) => ({ col, row }))).filter((step) => step.col || step.row);
const distanceSquared = (a: Point, b: Point) => (a.col - b.col) ** 2 + (a.row - b.row) ** 2;
const distanceToBounds = (p: Point, b: Settlement['bounds']) => {
  const dx = p.col < b.left ? b.left - p.col : p.col > b.right ? p.col - b.right : 0;
  const dy = p.row < b.top ? b.top - p.row : p.row > b.bottom ? p.row - b.bottom : 0;
  return Math.hypot(dx, dy);
};
const randomFor = (seed: number, id: string) => {
  let value = (seed ^ 2166136261) >>> 0;
  for (const char of id) value = Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0;
  return () => { value = Math.imul(value ^ (value >>> 15), 2246822519) >>> 0; value = Math.imul(value ^ (value >>> 13), 3266489917) >>> 0; return ((value ^ (value >>> 16)) >>> 0) / 0x100000000; };
};

export function placeGoblinNests(editor: AuthoredTileEditor, settlements: readonly Settlement[], reader: TileReader, seed: number): GoblinNest[] {
  const roads = [...editor.entries()].map(([, tile]) => tile).filter((tile) => isRoadSurface(tile.kind));
  const roadBuckets = new Map<string, Point[]>();
  for (const road of roads) { const id = `${Math.floor(road.col / 8)},${Math.floor(road.row / 8)}`; const bucket = roadBuckets.get(id) ?? []; bucket.push(road); roadBuckets.set(id, bucket); }
  const accepted: GoblinNest[] = [];
  const eligible = (point: Point, settlement: Settlement) => {
    if (point.col < 1 || point.row < 1 || point.col >= reader.width - 1 || point.row >= reader.height - 1) return false;
    if (!reader.getTile(point)?.walkable) return false;
    if (settlements.some((s) => distanceToBounds(point, s.bounds) < 20)) return false;
    for (let row = Math.floor((point.row - 8) / 8); row <= Math.floor((point.row + 8) / 8); row += 1) for (let col = Math.floor((point.col - 8) / 8); col <= Math.floor((point.col + 8) / 8); col += 1) if ((roadBuckets.get(`${col},${row}`) ?? []).some((road) => distanceSquared(point, road) < 8 ** 2)) return false;
    const settlementDistance = distanceToBounds(point, settlement.bounds);
    return settlementDistance >= 20 && settlementDistance <= 60;
  };
  const spawnTiles = (center: Point, settlement: Settlement): [Point, Point, Point] | null => {
    const unique: Point[] = [];
    const queue = [center];
    const seen = new Set([tileKey(center)]);
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index]!;
      if (distanceSquared(current, center) <= 2 ** 2 && eligible(current, settlement)) unique.push(current);
      for (const step of directions) {
        const point = { col: current.col + step.col, row: current.row + step.row };
        if (distanceSquared(point, center) > 2 ** 2 || seen.has(tileKey(point)) || !eligible(point, settlement)) continue;
        if (step.col && step.row && (!eligible({ col: current.col + step.col, row: current.row }, settlement) || !eligible({ col: current.col, row: current.row + step.row }, settlement))) continue;
        seen.add(tileKey(point)); queue.push(point);
      }
    }
    if (unique.length < 3) return null;
    return [unique[0]!, unique[1]!, unique[2]!];
  };
  const ordered = [...settlements].sort((a, b) => a.id.localeCompare(b.id));
  for (const settlement of ordered) {
    const random = randomFor(seed, `goblin-nests:${settlement.id}`);
    let placed = 0;
    for (let attempt = 0; attempt < MAX_ATTEMPTS && placed < NESTS_PER_SETTLEMENT; attempt += 1) {
      const point = { col: Math.floor(settlement.bounds.left - 60 + random() * (settlement.bounds.right - settlement.bounds.left + 120)), row: Math.floor(settlement.bounds.top - 60 + random() * (settlement.bounds.bottom - settlement.bounds.top + 120)) };
      if (!eligible(point, settlement) || accepted.some((nest) => distanceSquared(point, nest) < 24 ** 2)) continue;
      const spawns = spawnTiles(point, settlement);
      if (!spawns) continue;
      accepted.push({ ...point, id: `goblin-nest-${settlement.id}-${placed}`, spawnTiles: spawns });
      placed += 1;
    }
  }
  return accepted;
}
