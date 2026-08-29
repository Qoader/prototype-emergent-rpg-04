import type { Country, Point, RealmTheme, Settlement, SettlementKind, Tile, TileKind, WorldFeature, WorldMap } from './types';

export const TILE_SIZE = 48;
export const MAP_WIDTH = 480;
export const MAP_HEIGHT = 192;
const blocked = new Set<TileKind>(['water', 'rock', 'hill', 'house']);
const realms: Array<Omit<Country, 'id'>> = [
  { name: 'Alderwyn', theme: 'highland', color: '#b95747', banner: '#f0c674' },
  { name: 'Thornmere', theme: 'forest', color: '#4c8763', banner: '#d6e2a4' },
  { name: 'Valedorn', theme: 'river', color: '#4d7da8', banner: '#e7d7a2' },
  { name: 'Caerwyn', theme: 'coastal', color: '#8a638e', banner: '#f0b27a' },
  { name: 'Sungate Marches', theme: 'marches', color: '#b98640', banner: '#f7df8d' },
];
const settlementNames: Record<SettlementKind, string[]> = {
  capital: ['Highcourt', 'Greenglen', 'Rivercrown', 'Seaward', 'Goldwatch'],
  city: ['Briarhold', 'Mossford', 'Larkspur', 'Dunwall', 'Brightmere', 'Oakrest', 'Kingscross', 'Fairhaven', 'Willowgate', 'Amberfield', 'Stonebridge', 'Roseward'],
  village: ['Ashbrook', 'Cloverden', 'Fern Hollow', 'Littleford', 'Hearthstead', 'Pinecross', 'Millrun', 'Applewick', 'Dovefield', 'Brookhollow', 'Foxglove', 'Tansy Vale', 'Wrenfield', 'Meadowrun', 'Glimmerfen'],
};
const dimensions: Record<SettlementKind, number> = { village: 13, city: 21, capital: 29 };

export function createMap(seed = 7331): WorldMap {
  const tiles: Tile[] = []; let state = seed >>> 0; const random = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 0x100000000; };
  const countries = realms.map((realm, index) => ({ ...realm, id: `realm-${index}` }));
  const countryAt = (col: number) => countries[Math.min(countries.length - 1, Math.floor(col / (MAP_WIDTH / countries.length)))];
  const terrainFor = (theme: RealmTheme, roll: number): TileKind => theme === 'highland' ? (roll < 0.11 ? 'rock' : roll < 0.34 ? 'hill' : roll < 0.5 ? 'forest' : 'grass') : theme === 'forest' ? (roll < 0.52 ? 'forest' : roll < 0.66 ? 'flower' : roll < 0.72 ? 'water' : 'grass') : theme === 'river' ? (roll < 0.14 ? 'water' : roll < 0.28 ? 'flower' : roll < 0.39 ? 'forest' : 'grass') : theme === 'coastal' ? (roll < 0.18 ? 'water' : roll < 0.28 ? 'sand' : roll < 0.42 ? 'flower' : 'grass') : (roll < 0.18 ? 'sand' : roll < 0.33 ? 'flower' : roll < 0.43 ? 'hill' : 'grass');
  for (let row = 0; row < MAP_HEIGHT; row += 1) for (let col = 0; col < MAP_WIDTH; col += 1) { const edge = col < 3 || row < 3 || col >= MAP_WIDTH - 3 || row >= MAP_HEIGHT - 3; const country = countryAt(col); const kind = edge ? 'water' : terrainFor(country.theme, random()); tiles.push({ col, row, kind, walkable: !blocked.has(kind), countryId: country.id }); }
  const at = (point: Point) => tiles[point.row * MAP_WIDTH + point.col]; const settlements: Settlement[] = []; const features: WorldFeature[] = [];
  const overlaps = (left: number, top: number, right: number, bottom: number) => settlements.some((s) => left <= s.bounds.right + 3 && right + 3 >= s.bounds.left && top <= s.bounds.bottom + 3 && bottom + 3 >= s.bounds.top);
  const addSettlement = (country: Country, kind: SettlementKind, col: number, row: number, name: string) => {
    const size = dimensions[kind]; const half = Math.floor(size / 2); const bounds = { left: col - half, top: row - half, right: col + half, bottom: row + half }; const settlement: Settlement = { id: `${country.id}-${kind}-${settlements.length}`, name, kind, countryId: country.id, col, row, radius: half, bounds, entrances: [{ col, row }] }; settlements.push(settlement);
    for (let y = bounds.top; y <= bounds.bottom; y += 1) for (let x = bounds.left; x <= bounds.right; x += 1) { if (x < 3 || y < 3 || x >= MAP_WIDTH - 3 || y >= MAP_HEIGHT - 3) continue; const tile = at({ col: x, row: y }); tile.kind = 'grass'; tile.walkable = true; tile.settlementId = settlement.id; }
    const ring = Math.floor(size / 2) - 3; for (let y = bounds.top + 2; y <= bounds.bottom - 2; y += 1) for (let x = bounds.left + 2; x <= bounds.right - 2; x += 1) { const dx = x - col; const dy = y - row; const distance = Math.max(Math.abs(dx), Math.abs(dy)); const gap = (x + y * 3 + settlement.id.length) % 5 === 0; if (distance >= ring - 1 && distance <= ring && !gap && Math.abs(dx) > 1 && Math.abs(dy) > 1) { const tile = at({ col: x, row: y }); tile.kind = 'house'; tile.walkable = false; } }
    for (let y = row - 2; y <= row + 2; y += 1) for (let x = col - 2; x <= col + 2; x += 1) { const tile = at({ col: x, row: y }); tile.kind = 'grass'; tile.walkable = true; tile.settlementId = settlement.id; } return settlement;
  };
  countries.forEach((country, index) => { const left = index * (MAP_WIDTH / countries.length) + 10; const right = (index + 1) * (MAP_WIDTH / countries.length) - 10; const center = Math.round((left + right) / 2); addSettlement(country, 'capital', center, index % 2 ? 142 : 50, settlementNames.capital[index]); addSettlement(country, 'city', left + 10, 82 + (index % 2) * 18, settlementNames.city[index * 2]); addSettlement(country, 'city', right - 10, 110 - (index % 2) * 18, settlementNames.city[index * 2 + 1]); if (index % 2 === 0) addSettlement(country, 'city', center, 155, settlementNames.city[10 + index / 2]); const anchors = settlements.filter((s) => s.countryId === country.id && s.kind !== 'village'); for (let village = 0; village < 6; village += 1) { const anchor = anchors[village % anchors.length]; let col = anchor.col + (village % 2 ? -9 : 9); let row = anchor.row + (village < 3 ? 15 : -15); let tries = 0; while (tries < 20 && (overlaps(col - 6, row - 6, col + 6, row + 6) || col < left + 7 || col > right - 7 || row < 10 || row > MAP_HEIGHT - 10)) { col += tries % 2 ? 3 : -3; row += tries % 3 ? 2 : -2; tries += 1; } addSettlement(country, 'village', col, row, settlementNames.village[index * 3 + village % 3]); } });
  const isRoute = (point: Point) => { const tile = at(point); return tile?.kind === 'road' || tile?.kind === 'bridge'; };
  const key = (point: Point) => `${point.col},${point.row}`;
  const createsWideBlock = (point: Point, pending: Set<string>) => {
    const routeAt = (candidate: Point) => isRoute(candidate) || pending.has(key(candidate));
    for (const origin of [{ col: point.col, row: point.row }, { col: point.col - 1, row: point.row }, { col: point.col, row: point.row - 1 }, { col: point.col - 1, row: point.row - 1 }]) {
      const square = [{ col: origin.col, row: origin.row }, { col: origin.col + 1, row: origin.row }, { col: origin.col, row: origin.row + 1 }, { col: origin.col + 1, row: origin.row + 1 }];
      if (square.every(routeAt)) return true;
    }
    return false;
  };
  const route = (from: Point, goal: (point: Point) => boolean, sourceId: string, targetId?: string, wholeMap = false, forbidden = new Set<string>(), boundsTarget?: Point): Point[] | null => {
    const minCol = wholeMap ? 3 : Math.max(3, Math.min(from.col, boundsTarget?.col ?? from.col) - 32); const maxCol = wholeMap ? MAP_WIDTH - 4 : Math.min(MAP_WIDTH - 4, Math.max(from.col, boundsTarget?.col ?? from.col) + 32);
    const minRow = wholeMap ? 3 : Math.max(3, Math.min(from.row, boundsTarget?.row ?? from.row) - 32); const maxRow = wholeMap ? MAP_HEIGHT - 4 : Math.min(MAP_HEIGHT - 4, Math.max(from.row, boundsTarget?.row ?? from.row) + 32);
    const queue = [from]; let head = 0; const came = new Map<string, Point>(); const seen = new Set([key(from)]);
    const steps = [{ col: 1, row: 0 }, { col: -1, row: 0 }, { col: 0, row: 1 }, { col: 0, row: -1 }];
    while (head < queue.length) { const current = queue[head++]; if (goal(current)) break; for (const step of steps) {
      const next = { col: current.col + step.col, row: current.row + step.row }; const tile = at(next); const nextKey = key(next);
      if (!tile || next.col < minCol || next.col > maxCol || next.row < minRow || next.row > maxRow || seen.has(nextKey) || forbidden.has(nextKey) || tile.kind === 'house' || (tile.settlementId && tile.settlementId !== sourceId && tile.settlementId !== targetId && !isRoute(next))) continue;
      seen.add(nextKey); came.set(nextKey, current); queue.push(next);
    } }
    const endpoint = queue.slice(0, head).find((point) => goal(point)); if (!endpoint) return null;
    const path: Point[] = []; let cursor = endpoint; while (key(cursor) !== key(from)) { path.unshift(cursor); cursor = came.get(key(cursor))!; } return path;
  };
  const narrowRoute = (from: Point, goal: (point: Point) => boolean, sourceId: string, targetId?: string, wholeMap = false, boundsTarget?: Point) => {
    const forbidden = new Set<string>();
    for (let attempt = 0; attempt <= (wholeMap ? MAP_WIDTH * MAP_HEIGHT : 5000); attempt += 1) {
      const path = route(from, goal, sourceId, targetId, wholeMap, forbidden, boundsTarget); if (!path) return null;
      const pending = new Set<string>(); const offending: Point[] = [];
      for (const point of path) { if (!isRoute(point)) { pending.add(key(point)); if (createsWideBlock(point, pending)) { pending.delete(key(point)); offending.push(point); } } }
      if (!offending.length) return path; for (const point of offending) forbidden.add(key(point));
    }
    return null;
  };
  const hasSettlementRoute = (settlement: Settlement) => { for (let row = settlement.bounds.top; row <= settlement.bounds.bottom; row += 1) for (let col = settlement.bounds.left; col <= settlement.bounds.right; col += 1) if (isRoute({ col, row })) return true; return false; };
  const carvePath = (path: Point[]) => { for (const point of path) { const tile = at(point); if (tile.kind !== 'road' && tile.kind !== 'bridge') { tile.groundKind = tile.kind; tile.kind = tile.groundKind === 'water' ? 'bridge' : 'road'; } tile.walkable = true; } };
  const carveRoad = (from: Settlement, to: Settlement) => {
    const direct = narrowRoute(from, (point) => point.col === to.col && point.row === to.row, from.id, to.id, false, to);
    if (direct) { carvePath(direct); from.entrances.push(direct[0] ?? from); to.entrances.push(direct[direct.length - 1] ?? to); return; }
    const fromHasRoute = hasSettlementRoute(from); const toHasRoute = hasSettlementRoute(to);
    if (fromHasRoute && toHasRoute) return;
    const origin = fromHasRoute ? to : from; const originId = origin.id;
    const merge = narrowRoute(origin, (point) => isRoute(point), originId, undefined, true);
    if (!merge) return;
    carvePath(merge); origin.entrances.push(merge[0] ?? origin);
  };
  countries.forEach((country, index) => { const own = settlements.filter((s) => s.countryId === country.id); const capital = own.find((s) => s.kind === 'capital')!; const cities = own.filter((s) => s.kind === 'city'); cities.forEach((city) => carveRoad(capital, city)); own.filter((s) => s.kind === 'village').forEach((village, villageIndex) => carveRoad(village, cities[villageIndex % cities.length])); if (index > 0) { const previous = settlements.find((s) => s.countryId === countries[index - 1].id && s.kind === 'capital')!; carveRoad(previous, capital); features.push({ col: Math.floor(index * MAP_WIDTH / countries.length), row: capital.row, kind: 'gate' }); } });
  for (let index = 1; index < countries.length; index += 1) for (let row = 20; row < MAP_HEIGHT - 20; row += 32) features.push({ col: Math.floor(index * MAP_WIDTH / countries.length), row, kind: 'frontier-marker' }); const startingVillage = settlements.find((s) => s.countryId === countries[0].id && s.kind === 'village')!; return { width: MAP_WIDTH, height: MAP_HEIGHT, tiles, spawn: { col: startingVillage.col, row: startingVillage.row }, countries, settlements, features };
}
export function tileAt(map: WorldMap, point: Point): Tile | undefined { return point.col >= 0 && point.row >= 0 && point.col < map.width && point.row < map.height ? map.tiles[point.row * map.width + point.col] : undefined; }
export function clampPoint(map: WorldMap, point: Point): Point { return { col: Math.max(0, Math.min(map.width - 1, point.col)), row: Math.max(0, Math.min(map.height - 1, point.row)) }; }
