import type { CardinalDirection, Country, GroundKind, Point, RealmTheme, Settlement, SettlementGate, SettlementKind, Tile, TileKind, WorldFeature, WorldMap, WorldRoad } from './types';

export const TILE_SIZE = 48;
export const MAP_WIDTH = 480;
export const MAP_HEIGHT = 192;
const blocked = new Set<TileKind>(['water', 'rock', 'hill', 'house', 'wall', 'tower']);
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
    const size = dimensions[kind]; const half = Math.floor(size / 2); const bounds = { left: col - half, top: row - half, right: col + half, bottom: row + half }; const settlement: Settlement = { id: `${country.id}-${kind}-${settlements.length}`, name, kind, countryId: country.id, col, row, radius: half, bounds, gates: [] }; settlements.push(settlement);
    for (let y = bounds.top; y <= bounds.bottom; y += 1) for (let x = bounds.left; x <= bounds.right; x += 1) { if (x < 3 || y < 3 || x >= MAP_WIDTH - 3 || y >= MAP_HEIGHT - 3) continue; const tile = at({ col: x, row: y }); tile.kind = 'grass'; tile.walkable = true; tile.settlementId = settlement.id; }
    const ring = Math.floor(size / 2) - 3; for (let y = bounds.top + 2; y <= bounds.bottom - 2; y += 1) for (let x = bounds.left + 2; x <= bounds.right - 2; x += 1) { const dx = x - col; const dy = y - row; const distance = Math.max(Math.abs(dx), Math.abs(dy)); const gap = (x + y * 3 + settlement.id.length) % 5 === 0; if (distance >= ring - 1 && distance <= ring && !gap && Math.abs(dx) > 1 && Math.abs(dy) > 1) { const tile = at({ col: x, row: y }); tile.kind = 'house'; tile.walkable = false; } }
    for (let y = row - 2; y <= row + 2; y += 1) for (let x = col - 2; x <= col + 2; x += 1) { const tile = at({ col: x, row: y }); tile.kind = 'grass'; tile.walkable = true; tile.settlementId = settlement.id; } return settlement;
  };
  countries.forEach((country, index) => { const left = index * (MAP_WIDTH / countries.length) + 10; const right = (index + 1) * (MAP_WIDTH / countries.length) - 10; const center = Math.round((left + right) / 2); addSettlement(country, 'capital', center, index % 2 ? 142 : 50, settlementNames.capital[index]); addSettlement(country, 'city', left + 10, 82 + (index % 2) * 18, settlementNames.city[index * 2]); addSettlement(country, 'city', right - 10, 110 - (index % 2) * 18, settlementNames.city[index * 2 + 1]); if (index % 2 === 0) addSettlement(country, 'city', center, 155, settlementNames.city[10 + index / 2]); const anchors = settlements.filter((s) => s.countryId === country.id && s.kind !== 'village'); for (let village = 0; village < 6; village += 1) { const anchor = anchors[village % anchors.length]; let col = anchor.col + (village % 2 ? -9 : 9); let row = anchor.row + (village < 3 ? 15 : -15); let tries = 0; while (tries < 20 && (overlaps(col - 6, row - 6, col + 6, row + 6) || col < left + 7 || col > right - 7 || row < 10 || row > MAP_HEIGHT - 10)) { col += tries % 2 ? 3 : -3; row += tries % 3 ? 2 : -2; tries += 1; } addSettlement(country, 'village', col, row, settlementNames.village[index * 3 + village % 3]); } });
  const isRoute = (point: Point) => { const tile = at(point); return tile?.kind === 'road' || tile?.kind === 'bridge' || tile?.kind === 'gate'; };
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
      if (!tile || next.col < minCol || next.col > maxCol || next.row < minRow || next.row > maxRow || seen.has(nextKey) || forbidden.has(nextKey) || tile.kind === 'house' || tile.kind === 'wall' || tile.kind === 'tower' || (tile.settlementId && tile.settlementId !== sourceId && tile.settlementId !== targetId && !isRoute(next))) continue;
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
  const carvePath = (path: Point[]) => { for (const point of path) { const tile = at(point); if (tile.kind !== 'road' && tile.kind !== 'bridge' && tile.kind !== 'gate') { const base: GroundKind = tile.kind === 'water' ? 'water' : tile.kind === 'house' ? 'grass' : ['grass', 'flower', 'rock', 'forest', 'hill', 'sand'].includes(tile.kind) ? tile.kind as GroundKind : 'grass'; tile.groundKind = base; tile.kind = base === 'water' ? 'bridge' : 'road'; } tile.walkable = true; } };
  const carveRoad = (from: Settlement, to: Settlement) => {
    const direct = narrowRoute(from, (point) => point.col === to.col && point.row === to.row, from.id, to.id, false, to);
    if (direct) { carvePath(direct); return; }
    const fromHasRoute = hasSettlementRoute(from); const toHasRoute = hasSettlementRoute(to);
    if (fromHasRoute && toHasRoute) return;
    const origin = fromHasRoute ? to : from; const originId = origin.id;
    const merge = narrowRoute(origin, (point) => isRoute(point), originId, undefined, true);
    if (!merge) return;
    carvePath(merge);
  };
  countries.forEach((country, index) => { const own = settlements.filter((s) => s.countryId === country.id); const capital = own.find((s) => s.kind === 'capital')!; const cities = own.filter((s) => s.kind === 'city'); cities.forEach((city) => carveRoad(capital, city)); own.filter((s) => s.kind === 'village').forEach((village, villageIndex) => carveRoad(village, cities[villageIndex % cities.length])); if (index > 0) { const previous = settlements.find((s) => s.countryId === countries[index - 1].id && s.kind === 'capital')!; carveRoad(previous, capital); } });

  const roads: WorldRoad[] = [];
  const addRoad = (a: Settlement, b: Settlement) => roads.push({ id: `road-${roads.length}`, settlementIds: [a.id, b.id] });
  countries.forEach((country, index) => { const own = settlements.filter((s) => s.countryId === country.id); const capital = own.find((s) => s.kind === 'capital')!; const cities = own.filter((s) => s.kind === 'city'); cities.forEach((city) => addRoad(capital, city)); own.filter((s) => s.kind === 'village').forEach((village, villageIndex) => addRoad(village, cities[villageIndex % cities.length])); if (index > 0) { const previous = settlements.find((s) => s.countryId === countries[index - 1].id && s.kind === 'capital')!; addRoad(previous, capital); } });
  const perimeter = (settlement: Settlement, point: Point) => point.col === settlement.bounds.left || point.col === settlement.bounds.right || point.row === settlement.bounds.top || point.row === settlement.bounds.bottom;
  const corner = (settlement: Settlement, point: Point) => (point.col === settlement.bounds.left || point.col === settlement.bounds.right) && (point.row === settlement.bounds.top || point.row === settlement.bounds.bottom);
  const directions: Array<{ direction: CardinalDirection; delta: Point }> = [{ direction: 'north', delta: { col: 0, row: -1 } }, { direction: 'east', delta: { col: 1, row: 0 } }, { direction: 'south', delta: { col: 0, row: 1 } }, { direction: 'west', delta: { col: -1, row: 0 } }];
  const inside = (settlement: Settlement, point: Point) => point.col > settlement.bounds.left && point.col < settlement.bounds.right && point.row > settlement.bounds.top && point.row < settlement.bounds.bottom;
  const deriveGates = (settlement: Settlement) => {
    if (settlement.kind === 'village') return;
    for (let row = settlement.bounds.top; row <= settlement.bounds.bottom; row += 1) for (let col = settlement.bounds.left; col <= settlement.bounds.right; col += 1) {
      const point = { col, row }; if (!perimeter(settlement, point) || corner(settlement, point) || !isRoute(point)) continue;
      const crossing = directions.find(({ delta }) => { const neighbor = { col: point.col + delta.col, row: point.row + delta.row }; return isRoute(neighbor) && inside(settlement, neighbor); });
      const exterior = directions.find(({ delta }) => { const neighbor = { col: point.col + delta.col, row: point.row + delta.row }; return isRoute(neighbor) && !inside(settlement, neighbor) && !perimeter(settlement, neighbor); });
      if (!crossing || !exterior) continue;
      const gate: SettlementGate = { ...point, id: `${settlement.id}-gate-${point.col}-${point.row}`, direction: exterior.direction }; settlement.gates.push(gate);
      const tile = at(point); tile.kind = 'gate'; tile.walkable = true; tile.settlementId = settlement.id;
    }
  };
  for (let pass = 0; pass < 64; pass += 1) {
    let repaired = false;
    for (let row = 3; row < MAP_HEIGHT - 4 && !repaired; row += 1) for (let col = 3; col < MAP_WIDTH - 4 && !repaired; col += 1) {
      const square = [{ col, row }, { col: col + 1, row }, { col, row: row + 1 }, { col: col + 1, row: row + 1 }];
      if (!square.every(isRoute)) continue;
      const candidate = square.filter((point) => at(point).kind !== 'gate').sort((a, b) => {
        const degree = (point: Point) => [{ col: point.col + 1, row: point.row }, { col: point.col - 1, row: point.row }, { col: point.col, row: point.row + 1 }, { col: point.col, row: point.row - 1 }].filter(isRoute).length;
        return degree(a) - degree(b) || a.row - b.row || a.col - b.col;
      })[0];
      if (!candidate) continue;
      const tile = at(candidate); tile.kind = 'grass'; tile.walkable = true; tile.groundKind = undefined; repaired = true;
    }
    if (!repaired) break;
  }

  for (const settlement of settlements) deriveGates(settlement);
  for (const settlement of settlements.filter((s) => s.kind !== 'village')) {
    const { left, top, right, bottom } = settlement.bounds;
    for (let row = top; row <= bottom; row += 1) for (let col = left; col <= right; col += 1) { const tile = at({ col, row }); const boundary = col === left || col === right || row === top || row === bottom; if (!boundary) continue; if (settlement.kind === 'capital' && (col === left || col === right) && (row === top || row === bottom)) { tile.kind = 'tower'; tile.walkable = false; } else if (tile.kind !== 'gate') { tile.kind = 'wall'; tile.walkable = false; } }
  }

  const routeKind = (point: Point) => { const kind = at(point)?.kind; return kind === 'road' || kind === 'bridge' || kind === 'gate'; };
  const featureKey = (point: Point) => `${point.col},${point.row}`;
  const featureKeys = new Set<string>();
  const addMarker = (point: Point, avoidRoute = true) => {
    if (point.col < 0 || point.row < 0 || point.col >= MAP_WIDTH || point.row >= MAP_HEIGHT || (avoidRoute && routeKind(point))) return false;
    const key = featureKey(point); if (featureKeys.has(key)) return false;
    features.push({ ...point, kind: 'frontier-marker' }); featureKeys.add(key); return true;
  };
  const addFlankingMarker = (origin: Point, delta: Point) => {
    for (let distance = 1; distance < Math.max(MAP_WIDTH, MAP_HEIGHT); distance += 1) {
      if (addMarker({ col: origin.col + delta.col * distance, row: origin.row + delta.row * distance })) return;
    }
  };
  const countryPair = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;
  const addCrossingCorridor = (orientation: 'horizontal' | 'vertical', seam: number, start: number, end: number) => {
    if (orientation === 'horizontal') {
      const crossing: Point = { col: seam, row: Math.floor((start + end) / 2) };
      addFlankingMarker(crossing, { col: 0, row: -1 }); addFlankingMarker(crossing, { col: 0, row: 1 });
    } else {
      const crossing: Point = { col: Math.floor((start + end) / 2), row: seam };
      addFlankingMarker(crossing, { col: -1, row: 0 }); addFlankingMarker(crossing, { col: 1, row: 0 });
    }
  };
  // A horizontal corridor crosses a vertical seam; a vertical corridor crosses a horizontal seam.
  for (let leftCol = 0; leftCol < MAP_WIDTH - 1; leftCol += 1) {
    let start = -1; let pair = '';
    for (let row = 0; row <= MAP_HEIGHT; row += 1) {
      const west = row < MAP_HEIGHT ? at({ col: leftCol, row }) : undefined;
      const east = row < MAP_HEIGHT ? at({ col: leftCol + 1, row }) : undefined;
      const currentPair = west && east && west.countryId !== east.countryId && routeKind(west) && routeKind(east) ? countryPair(west.countryId!, east.countryId!) : '';
      if (currentPair && currentPair === pair) continue;
      if (start >= 0) addCrossingCorridor('horizontal', leftCol + 1, start, row - 1);
      start = currentPair ? row : -1; pair = currentPair;
    }
  }
  for (let topRow = 0; topRow < MAP_HEIGHT - 1; topRow += 1) {
    let start = -1; let pair = '';
    for (let col = 0; col <= MAP_WIDTH; col += 1) {
      const north = col < MAP_WIDTH ? at({ col, row: topRow }) : undefined;
      const south = col < MAP_WIDTH ? at({ col, row: topRow + 1 }) : undefined;
      const currentPair = north && south && north.countryId !== south.countryId && routeKind(north) && routeKind(south) ? countryPair(north.countryId!, south.countryId!) : '';
      if (currentPair && currentPair === pair) continue;
      if (start >= 0) addCrossingCorridor('vertical', topRow + 1, start, col - 1);
      start = currentPair ? col : -1; pair = currentPair;
    }
  }
  for (let index = 1; index < countries.length; index += 1) for (let row = 20; row < MAP_HEIGHT - 20; row += 32) addMarker({ col: Math.floor(index * MAP_WIDTH / countries.length), row });
  const startingVillage = settlements.find((s) => s.countryId === countries[0].id && s.kind === 'village')!;
  return { width: MAP_WIDTH, height: MAP_HEIGHT, tiles, spawn: { col: startingVillage.col, row: startingVillage.row }, countries, settlements, roads, features };
}
export function tileAt(map: WorldMap, point: Point): Tile | undefined { return point.col >= 0 && point.row >= 0 && point.col < map.width && point.row < map.height ? map.tiles[point.row * map.width + point.col] : undefined; }
export function clampPoint(map: WorldMap, point: Point): Point { return { col: Math.max(0, Math.min(map.width - 1, point.col)), row: Math.max(0, Math.min(map.height - 1, point.row)) }; }
