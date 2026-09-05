import type {
  CardinalDirection,
  Country,
  Point,
  Settlement,
  SettlementKind,
  Tile,
  TileKind,
  WorldFeature,
  WorldMap,
  WorldRoad
} from './types';
export const TILE_SIZE = 48;
export const MAP_WIDTH = 2048;
export const MAP_HEIGHT = 2048;
// Keep generated/rendered work small enough for mobile browsers. The world
// itself is unchanged; chunks are only a streaming unit.
export const CHUNK_SIZE = 16;
export const GENERATOR_VERSION = 5;
const blocked = new Set<TileKind>(['water', 'rock', 'hill', 'house', 'wall', 'tower']);
const realms: Array<Omit<Country, 'id'>> = [
  { name: 'Alderwyn', theme: 'highland', color: '#b95747', banner: '#f0c674' },
  { name: 'Thornmere', theme: 'forest', color: '#4c8763', banner: '#d6e2a4' },
  { name: 'Valedorn', theme: 'river', color: '#4d7da8', banner: '#e7d7a2' },
  { name: 'Caerwyn', theme: 'coastal', color: '#8a638e', banner: '#f0b27a' },
  { name: 'Sungate Marches', theme: 'marches', color: '#b98640', banner: '#f7df8d' }
];
const names: Record<SettlementKind, string[]> = {
  capital: ['Highcourt', 'Greenglen', 'Rivercrown', 'Seaward', 'Goldwatch'],
  city: [
    'Briarhold',
    'Mossford',
    'Larkspur',
    'Dunwall',
    'Brightmere',
    'Oakrest',
    'Kingscross',
    'Fairhaven',
    'Willowgate',
    'Amberfield',
    'Stonebridge',
    'Roseward'
  ],
  village: [
    'Ashbrook',
    'Cloverden',
    'Fern Hollow',
    'Littleford',
    'Hearthstead',
    'Pinecross',
    'Millrun',
    'Applewick',
    'Dovefield',
    'Brookhollow',
    'Foxglove',
    'Tansy Vale',
    'Wrenfield',
    'Meadowrun',
    'Glimmerfen'
  ]
};
const dimensions: Record<SettlementKind, number> = { village: 13, city: 21, capital: 29 };
const k = (p: Point) => `${p.col},${p.row}`;
const hash = (seed: number, col: number, row: number) => {
  let h = (seed ^ (col * 374761393) ^ (row * 668265263) ^ (GENERATOR_VERSION * 1442695041)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
};
// Value noise keeps nearby tiles related (and therefore makes house groups
// read as clusters) while remaining cheap and fully deterministic.
const smooth = (value: number) => value * value * (3 - 2 * value);
const clusteredNoise = (seed: number, col: number, row: number, scale = 4) => {
  const gx = Math.floor(col / scale);
  const gy = Math.floor(row / scale);
  const tx = smooth((col - gx * scale) / scale);
  const ty = smooth((row - gy * scale) / scale);
  const at = (x: number, y: number) => hash(seed + 0x51ed270b, x * 17, y * 31);
  const north = at(gx, gy) * (1 - tx) + at(gx + 1, gy) * tx;
  const south = at(gx, gy + 1) * (1 - tx) + at(gx + 1, gy + 1) * tx;
  return north * (1 - ty) + south * ty;
};

type TerrainConfig = {
  flowerRate?: number;
  shares: Partial<Record<TileKind, number>>;
  fallback: TileKind;
};
const terrainConfig: Record<string, TerrainConfig> = {
  highland: { shares: { forest: 0.16, hill: 0.23, grass: 0.61 }, fallback: 'grass' },
  forest: { flowerRate: 0.14, shares: { forest: 0.60465, water: 0.06977, grass: 0.32558 }, fallback: 'grass' },
  river: { flowerRate: 0.14, shares: { water: 0.16279, forest: 0.12791, grass: 0.7093 }, fallback: 'grass' },
  coastal: { flowerRate: 0.14, shares: { water: 0.2093, sand: 0.11628, grass: 0.67442 }, fallback: 'grass' },
  marches: { flowerRate: 0.15, shares: { hill: 0.11765, grass: 0.21176, sand: 0.67059 }, fallback: 'sand' }
};
const REGION_SCALE = 16;
const REGION_JITTER = 5;
const terrainSalt = 0x19a3;
const flowerTemplates: Point[][] = [
  [{ col: 0, row: 0 }, { col: 1, row: 0 }],
  [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 0, row: 1 }],
  [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }],
  [{ col: 0, row: 0 }, { col: -1, row: 0 }, { col: 1, row: 0 }, { col: 0, row: -1 }],
  [{ col: 0, row: 0 }, { col: -1, row: 0 }, { col: 1, row: 0 }, { col: 0, row: -1 }, { col: 0, row: 1 }],
  [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }, { col: 0, row: 2 }, { col: 1, row: 2 }]
];
const transformedFlowerPoint = (offset: Point, variant: number): Point => {
  let { col, row } = offset;
  if (variant & 1) col = -col;
  if (variant & 2) row = -row;
  if (variant & 4) [col, row] = [row, col];
  return { col, row };
};
const flowerHash = (seed: number, col: number, row: number) => hash(seed ^ 0x5f3759df, col, row);
const FLOWER_CELL_SIZE = 5;
const flowerCellAnchor = (cellCol: number, cellRow: number) => ({ col: cellCol * FLOWER_CELL_SIZE + 1, row: cellRow * FLOWER_CELL_SIZE + 1 });
const flowerPatchTiles = (seed: number, cellCol: number, cellRow: number): Point[] => {
  const anchor = flowerCellAnchor(cellCol, cellRow);
  const choice = Math.floor(flowerHash(seed ^ 0xa1b2c3d4, cellCol, cellRow) * flowerTemplates.length);
  const variant = Math.floor(flowerHash(seed ^ 0x31415926, cellCol, cellRow) * 8);
  const shape = flowerTemplates[choice]!.map((offset) => transformedFlowerPoint(offset, variant));
  const left = Math.min(...shape.map((point) => point.col));
  const top = Math.min(...shape.map((point) => point.row));
  return shape.map((point) => ({ col: anchor.col + point.col - left, row: anchor.row + point.row - top }));
};
const flowerPatchAt = (seed: number, point: Point, activation = 0.65625) => {
  const cellCol = Math.floor(point.col / FLOWER_CELL_SIZE);
  const cellRow = Math.floor(point.row / FLOWER_CELL_SIZE);
  if (flowerHash(seed ^ 0x8badf00d, cellCol, cellRow) >= activation) return false;
  return flowerPatchTiles(seed, cellCol, cellRow).some((tile) => tile.col === point.col && tile.row === point.row);
};
const flowerAt = (seed: number, point: Point, isolatedRate: number, patchActivation: number) => {
  if (flowerPatchAt(seed, point, patchActivation)) return true;
  const single = (p: Point) => flowerHash(seed ^ 0x77aa11, p.col, p.row) < isolatedRate;
  if (!single(point)) return false;
  for (let row = point.row - 1; row <= point.row + 1; row++)
    for (let col = point.col - 1; col <= point.col + 1; col++) {
      if (col === point.col && row === point.row) continue;
      if (flowerPatchAt(seed, { col, row }, patchActivation) || (single({ col, row }) && flowerHash(seed ^ 0x77aa11, col, row) <= flowerHash(seed ^ 0x77aa11, point.col, point.row))) return false;
    }
  return true;
};
const regionSeed = (seed: number, cellCol: number, cellRow: number) => ({
  col: cellCol * REGION_SCALE + Math.floor(hash(seed ^ 0x2c1b3c6d, cellCol, cellRow) * 11) - REGION_JITTER,
  row: cellRow * REGION_SCALE + Math.floor(hash(seed ^ 0x7f4a7c15, cellCol, cellRow) * 11) - REGION_JITTER
});
const regionFor = (seed: number, point: Point) => {
  const cellCol = Math.floor(point.col / REGION_SCALE);
  const cellRow = Math.floor(point.row / REGION_SCALE);
  let best = { cellCol, cellRow, distance: Number.POSITIVE_INFINITY };
  for (let row = cellRow - 1; row <= cellRow + 1; row++) for (let col = cellCol - 1; col <= cellCol + 1; col++) {
    const candidate = regionSeed(seed, col, row);
    const distance = (candidate.col - point.col) ** 2 + (candidate.row - point.row) ** 2;
    if (distance < best.distance || (distance === best.distance && (row < best.cellRow || (row === best.cellRow && col < best.cellCol))))
      best = { cellCol: col, cellRow: row, distance };
  }
  return best;
};
const wildernessKind = (map: WorldMap, p: Point): TileKind => {
  const country = map.countries?.[Math.min(4, Math.floor(p.col / (MAP_WIDTH / 5)))] ?? realms[0] as Country;
  const seed = map.seed ?? 7331;
  const t = country.theme;
  const config = terrainConfig[t]!;
  if (config.flowerRate && flowerAt(seed + country.id.length * 97, p, t === 'marches' ? 0.067 : 0.061, t === 'marches' ? 0.703125 : 0.65625)) return 'flower';
  const region = regionFor(seed + terrainSalt + country.id.length * 7919, p);
  const terrainValue = hash(seed + terrainSalt, region.cellCol, region.cellRow);
  let cursor = 0;
  for (const [kind, share] of Object.entries(config.shares)) {
    cursor += share;
    if (terrainValue < cursor) return kind as TileKind;
  }
  return config.fallback;
};

const ROUTE_MIN_RUN = 3;
const ROUTE_MAX_RUN = 8;

/**
 * Generate a deterministic, monotonic cardinal route between two points.
 *
 * The ordered endpoints are included in the route seed so the same route is
 * reproduced when the corridor is reopened after settlement fortification.
 * Every step reduces Manhattan distance, while short seeded runs give the
 * route a natural rhythm of bends without allowing it to wander or loop.
 */
export function generateRoutePoints(seed: number, a: Point, b: Point): Point[] {
  const routeSeed = (
    seed ^
    Math.imul(a.col, 374761393) ^
    Math.imul(a.row, 668265263) ^
    Math.imul(b.col, 1274126177) ^
    Math.imul(b.row, 2246822519)
  ) >>> 0;
  const points: Point[] = [{ ...a }];
  let col = a.col;
  let row = a.row;
  let segment = 0;

  while (col !== b.col || row !== b.row) {
    const horizontalDistance = Math.abs(b.col - col);
    const verticalDistance = Math.abs(b.row - row);
    const totalDistance = horizontalDistance + verticalDistance;
    const randomAxis = hash(routeSeed, segment, 7919);
    const horizontal = horizontalDistance > 0 &&
      (verticalDistance === 0 || randomAxis < horizontalDistance / totalDistance);
    const distance = horizontal ? horizontalDistance : verticalDistance;
    const randomRun = hash(routeSeed ^ 0x9e3779b9, segment, 1543);
    const run = Math.min(
      distance,
      ROUTE_MIN_RUN + Math.floor(randomRun * (ROUTE_MAX_RUN - ROUTE_MIN_RUN + 1))
    );
    const dc = horizontal ? Math.sign(b.col - col) : 0;
    const dr = horizontal ? 0 : Math.sign(b.row - row);
    for (let step = 0; step < run; step += 1) {
      col += dc;
      row += dr;
      points.push({ col, row });
    }
    segment += 1;
  }
  return points;
}
function baseTile(map: WorldMap, p: Point): Tile {
  const country = map.countries?.[Math.min(4, Math.floor(p.col / (MAP_WIDTH / 5)))] ?? realms[0] as Country;
  const edge = p.col < 3 || p.row < 3 || p.col >= MAP_WIDTH - 3 || p.row >= MAP_HEIGHT - 3;
  let kind: TileKind = edge ? 'water' : wildernessKind(map, p);
  // Highland rocks are a second pass over grass only.  Requiring a local
  // minimum of the dedicated field keeps them isolated and deterministic.
  if (!edge && country.theme === 'highland' && kind === 'grass') {
    const rockSeed = (map.seed ?? 7331) ^ 0x9d31;
    const rock = hash(rockSeed, p.col, p.row);
    let eligible = rock < 0.045;
    for (let row = p.row - 1; row <= p.row + 1; row++)
      for (let col = p.col - 1; col <= p.col + 1; col++) {
        if (col === p.col && row === p.row) continue;
        const neighbor = { col, row };
        if (wildernessKind(map, neighbor) !== 'grass' || hash(rockSeed, col, row) < rock) eligible = false;
      }
    if (eligible) kind = 'rock';
  }
  return { col: p.col, row: p.row, kind, walkable: !blocked.has(kind), countryId: country.id };
}
export function createMap(seed = 7331): WorldMap {
  const countries = realms.map((r, i) => ({ ...r, id: `realm-${i}` }));
  const overlays = new Map<string, Tile>();
  const settlements: Settlement[] = [];
  const roads: WorldRoad[] = [];
  const features: WorldFeature[] = [];
  const put = (p: Point, patch: Partial<Tile>) => {
    const old =
      overlays.get(k(p)) ??
      baseTile({ seed, countries, width: MAP_WIDTH, height: MAP_HEIGHT } as WorldMap, p);
    overlays.set(k(p), { ...old, ...patch, col: p.col, row: p.row });
  };
  const bounds = (kind: SettlementKind, col: number, row: number) => {
    const h = Math.floor(dimensions[kind] / 2);
    return { left: col - h, top: row - h, right: col + h, bottom: row + h };
  };
  const occupied = (b: ReturnType<typeof bounds>) =>
    settlements.some(
      (s) =>
        b.left <= s.bounds.right + 3 &&
        b.right + 3 >= s.bounds.left &&
        b.top <= s.bounds.bottom + 3 &&
        b.bottom + 3 >= s.bounds.top
    );
  const add = (country: Country, kind: SettlementKind, col: number, row: number, name: string) => {
    col = Math.round(col);
    row = Math.round(row);
    const b = bounds(kind, col, row);
    if (
      b.left < 3 ||
      b.top < 3 ||
      b.right >= MAP_WIDTH - 3 ||
      b.bottom >= MAP_HEIGHT - 3 ||
      occupied(b)
    )
      return;
    const s: Settlement = {
      id: `${country.id}-${kind}-${settlements.length}`,
      name,
      kind,
      countryId: country.id,
      col,
      row,
      radius: Math.floor(dimensions[kind] / 2),
      bounds: b,
      gates: []
    };
    settlements.push(s);
    for (let y = b.top; y <= b.bottom; y++)
      for (let x = b.left; x <= b.right; x++)
        put({ col: x, row: y }, { kind: 'grass', walkable: true, settlementId: s.id });
    return s;
  };
  countries.forEach((c, i) => {
    const left = (i * MAP_WIDTH) / 5 + 40,
      right = ((i + 1) * MAP_WIDTH) / 5 - 40,
      center = Math.round((left + right) / 2);
    add(c, 'capital', center, i % 2 ? 1500 : 500, names.capital[i]);
    add(c, 'city', left + 100, 820 + (i % 2) * 180, names.city[i * 2]);
    add(c, 'city', right - 100, 1120 - (i % 2) * 180, names.city[i * 2 + 1]);
    if (i % 2 === 0) add(c, 'city', center, 1650, names.city[10 + i / 2]);
    const a = settlements.filter((s) => s.countryId === c.id && s.kind !== 'village');
    for (let v = 0; v < 6; v++) {
      const q = a[v % a.length]!;
      add(
        c,
        'village',
        q.col + (v % 2 ? -55 : 55),
        q.row + (v < 3 ? 110 : -110),
        names.village[i * 3 + (v % 3)]
      );
    }
  });
  const route = (a: Point, b: Point) => {
    const lead = (point: Point, other: Point) => {
      const settlement = settlements.find((candidate) => candidate.col === point.col && candidate.row === point.row);
      if (!settlement) return point;
      const horizontal = Math.abs(other.col - point.col) >= Math.abs(other.row - point.row);
      const distance = settlement.radius + 1;
      return horizontal
        ? { col: point.col + Math.sign(other.col - point.col) * distance, row: point.row }
        : { col: point.col, row: point.row + Math.sign(other.row - point.row) * distance };
    };
    const from = lead(a, b);
    const to = lead(b, a);
    const points = [
      ...generateRoutePoints(seed, a, from),
      ...generateRoutePoints(seed, from, to).slice(1),
      ...generateRoutePoints(seed, to, b).slice(1)
    ];
    const pave = (point: Point) => {
      const old = baseTile(
        { seed, countries, width: MAP_WIDTH, height: MAP_HEIGHT } as WorldMap,
        point
      );
      const bridge = old.kind === 'water';
      put(point, {
        kind: bridge ? 'bridge' : 'road',
        walkable: true,
        groundKind: bridge ? 'water' : 'grass'
      });
    };
    for (const point of points) pave(point);
  };
  const connect = (a: Settlement, b: Settlement) => {
    roads.push({ id: `road-${roads.length}`, settlementIds: [a.id, b.id] });
    route(a, b);
  };
  countries.forEach((c, i) => {
    const own = settlements.filter((s) => s.countryId === c.id),
      cap = own.find((s) => s.kind === 'capital')!,
      cities = own.filter((s) => s.kind === 'city');
    cities.forEach((q) => connect(cap, q));
    own
      .filter((s) => s.kind === 'village')
      .forEach((v, j) => connect(v, cities[j % cities.length]));
    if (i)
      connect(
        settlements.find((s) => s.countryId === countries[i - 1].id && s.kind === 'capital')!,
        cap
      );
  });
  for (const s of settlements.filter((q) => q.kind !== 'village')) {
    for (let y = s.bounds.top; y <= s.bounds.bottom; y++)
      for (let x = s.bounds.left; x <= s.bounds.right; x++)
        if (
          (x === s.bounds.left ||
            x === s.bounds.right ||
            y === s.bounds.top ||
            y === s.bounds.bottom)
        ) {
          const corner = (x === s.bounds.left || x === s.bounds.right) && (y === s.bounds.top || y === s.bounds.bottom);
          put({ col: x, row: y }, { kind: corner && s.kind === 'capital' ? 'tower' : 'wall', walkable: false, settlementId: s.id });
        }
  }
  // Reopen the authored road corridors after fortification walls are applied.
  // This preserves a guaranteed traversable spine through every settlement.
  for (const road of roads) {
    const a = settlements.find((s) => s.id === road.settlementIds[0]);
    const b = settlements.find((s) => s.id === road.settlementIds[1]);
    if (a && b) route(a, b);
  }
  // Corners are authoritative fortifications: authored routes must not open them.
  for (const s of settlements.filter((q) => q.kind !== 'village')) {
    for (const point of [
      { col: s.bounds.left, row: s.bounds.top },
      { col: s.bounds.right, row: s.bounds.top },
      { col: s.bounds.left, row: s.bounds.bottom },
      { col: s.bounds.right, row: s.bounds.bottom }
    ]) {
      put(point, { kind: s.kind === 'capital' ? 'tower' : 'wall', walkable: false, settlementId: s.id });
    }
  }
  // Collapse accidental overlaps while preserving the visible route graph.
  // The authored roads are logical connections, so redundant overlapping
  // tiles may be removed as long as no former route neighbor is disconnected.
  const routeTiles = new Set<string>();
  for (const tile of overlays.values()) {
    if (tile.kind === 'road' || tile.kind === 'bridge') routeTiles.add(k(tile));
  }
  const cardinalNeighbors = (point: Point) => [
    { col: point.col, row: point.row - 1 },
    { col: point.col + 1, row: point.row },
    { col: point.col, row: point.row + 1 },
    { col: point.col - 1, row: point.row }
  ];
  const anchors = [...routeTiles]
    .map((id) => {
      const [col, row] = id.split(',').map(Number);
      return { col, row };
    })
    .filter(({ col, row }) =>
      routeTiles.has(k({ col: col + 1, row })) &&
      routeTiles.has(k({ col, row: row + 1 })) &&
      routeTiles.has(k({ col: col + 1, row: row + 1 }))
    )
    .sort((a, b) => a.row - b.row || a.col - b.col);
  const restoreUnderlay = (point: Point) => {
    const settlement = settlements.find((candidate) =>
      point.col >= candidate.bounds.left && point.col <= candidate.bounds.right &&
      point.row >= candidate.bounds.top && point.row <= candidate.bounds.bottom
    );
    if (!settlement) {
      overlays.delete(k(point));
      return;
    }
    const perimeter = point.col === settlement.bounds.left || point.col === settlement.bounds.right ||
      point.row === settlement.bounds.top || point.row === settlement.bounds.bottom;
    if (perimeter && settlement.kind !== 'village') {
      const corner = (point.col === settlement.bounds.left || point.col === settlement.bounds.right) &&
        (point.row === settlement.bounds.top || point.row === settlement.bounds.bottom);
      put(point, { kind: corner && settlement.kind === 'capital' ? 'tower' : 'wall', walkable: false, settlementId: settlement.id });
      return;
    }
    put(point, { kind: 'grass', walkable: true, settlementId: settlement.id });
  };
  const canRemove = (point: Point) => {
    const neighbors = cardinalNeighbors(point).filter((neighbor) => routeTiles.has(k(neighbor)));
    if (neighbors.length < 2) return true;
    // In a 2x2 block, a degree-two tile's two neighbors are the other two
    // sides of that block and remain connected around the removed corner.
    if (neighbors.length === 2) return true;
    routeTiles.delete(k(point));
    const reachable = new Set<string>([k(neighbors[0]!)])
      , queue = [neighbors[0]!];
    for (let index = 0; index < queue.length && !neighbors.every((neighbor) => reachable.has(k(neighbor))); index += 1) {
      for (const neighbor of cardinalNeighbors(queue[index]!)) {
        if (routeTiles.has(k(neighbor)) && !reachable.has(k(neighbor))) {
          reachable.add(k(neighbor));
          queue.push(neighbor);
        }
      }
    }
    routeTiles.add(k(point));
    return neighbors.every((neighbor) => reachable.has(k(neighbor)));
  };
  for (const anchor of anchors) {
    const block = [
      anchor,
      { col: anchor.col + 1, row: anchor.row },
      { col: anchor.col, row: anchor.row + 1 },
      { col: anchor.col + 1, row: anchor.row + 1 }
    ];
    if (!block.every((point) => routeTiles.has(k(point)))) continue;
    const candidates = block
      .filter((point) => !settlements.some((settlement) => settlement.col === point.col && settlement.row === point.row))
      .map((point) => ({
        point,
        degree: cardinalNeighbors(point).filter((neighbor) => routeTiles.has(k(neighbor))).length,
        preference: cardinalNeighbors(point).filter((neighbor) => routeTiles.has(k(neighbor))).length === 2 ? 0 : 1,
        tie: hash(seed, point.col, point.row)
      }))
      .sort((a, b) => a.preference - b.preference || a.degree - b.degree || a.tie - b.tie);
    const removable = candidates.find(({ point }) => canRemove(point));
    if (!removable) {
      throw new Error(`Unable to normalize route overlap at ${anchor.col},${anchor.row}`);
    }
    routeTiles.delete(k(removable.point));
    restoreUnderlay(removable.point);
  }
  // Derive gates from the final road topology so metadata matches rendered tiles.
  const isRoute = (point: Point) => {
    const kind = overlays.get(k(point))?.kind;
    return kind === 'road' || kind === 'bridge' || kind === 'gate';
  };
  const directions: Array<{ direction: CardinalDirection; delta: Point }> = [
    { direction: 'north', delta: { col: 0, row: -1 } },
    { direction: 'east', delta: { col: 1, row: 0 } },
    { direction: 'south', delta: { col: 0, row: 1 } },
    { direction: 'west', delta: { col: -1, row: 0 } }
  ];
  const inside = (settlement: Settlement, point: Point) =>
    point.col > settlement.bounds.left &&
    point.col < settlement.bounds.right &&
    point.row > settlement.bounds.top &&
    point.row < settlement.bounds.bottom;
  for (const settlement of settlements.filter((s) => s.kind !== 'village')) {
    for (let row = settlement.bounds.top; row <= settlement.bounds.bottom; row++) {
      for (let col = settlement.bounds.left; col <= settlement.bounds.right; col++) {
        const point = { col, row };
        const perimeter =
          col === settlement.bounds.left ||
          col === settlement.bounds.right ||
          row === settlement.bounds.top ||
          row === settlement.bounds.bottom;
        const corner =
          (col === settlement.bounds.left || col === settlement.bounds.right) &&
          (row === settlement.bounds.top || row === settlement.bounds.bottom);
        if (!perimeter || corner || !isRoute(point)) continue;
        const crossing = directions.some(({ delta }) => {
          const neighbor = { col: col + delta.col, row: row + delta.row };
          return isRoute(neighbor) && inside(settlement, neighbor);
        });
        const exterior = directions.find(({ delta }) => {
          const neighbor = { col: col + delta.col, row: row + delta.row };
          return (
            isRoute(neighbor) &&
            !inside(settlement, neighbor) &&
            !(neighbor.col >= settlement.bounds.left &&
              neighbor.col <= settlement.bounds.right &&
              neighbor.row >= settlement.bounds.top &&
              neighbor.row <= settlement.bounds.bottom)
          );
        });
        if (!crossing || !exterior) continue;
        put(point, { kind: 'gate', walkable: true, settlementId: settlement.id });
        settlement.gates.push({
          ...point,
          id: `${settlement.id}-gate-${point.col}-${point.row}`,
          direction: exterior.direction
        });
      }
    }
  }
  // Select exactly 35% of the eligible interior for houses. Roads are fully
  // authored before this pass, so every route tile is protected. A route bias
  // makes homes tend toward streets without making remote lots impossible;
  // smooth noise and a small jitter produce irregular, coherent clusters.
  for (const settlement of settlements) {
    const { left, right, top, bottom } = settlement.bounds;
    const isPlaza = (col: number, row: number) => {
      if (settlement.kind === 'village') return false;
      const radius = settlement.kind === 'capital' ? 2 : 1;
      return Math.abs(col - settlement.col) <= radius && Math.abs(row - settlement.row) <= radius;
    };
    const routeKinds = new Set<TileKind>(['road', 'bridge', 'gate']);
    const sources: Point[] = [];
    for (let row = top; row <= bottom; row++) for (let col = left; col <= right; col++) {
      if (routeKinds.has(overlays.get(k({ col, row }))?.kind as TileKind)) sources.push({ col, row });
    }
    const candidates: Array<{ point: Point; score: number }> = [];
    for (let row = top + 1; row <= bottom - 1; row++) for (let col = left + 1; col <= right - 1; col++) {
      if (isPlaza(col, row)) continue;
      const existing = overlays.get(k({ col, row }));
      if (existing && (routeKinds.has(existing.kind) || existing.kind === 'wall' || existing.kind === 'tower')) continue;
      let distance = 0x7fffffff;
      for (const source of sources) distance = Math.min(distance, Math.abs(col - source.col) + Math.abs(row - source.row));
      // If a settlement has no route source, all lots get the same neutral bias.
      const routeScore = sources.length ? 1 / (distance + 1) : 0;
      const noise = clusteredNoise(seed + settlement.id.length * 7919, col, row);
      const jitter = hash(seed ^ 0x9e3779b9, col, row) * 0.08;
      candidates.push({ point: { col, row }, score: noise * 0.72 + routeScore * 0.9 + jitter });
    }
    const houseCount = Math.floor(candidates.length * 0.35);
    candidates.sort((a, b) => b.score - a.score || a.point.row - b.point.row || a.point.col - b.point.col);
    for (const candidate of candidates.slice(0, houseCount)) {
      put(candidate.point, { kind: 'house', walkable: false, settlementId: settlement.id });
    }
  }
  for (let i = 1; i < 5; i++)
    for (let row = 80; row < MAP_HEIGHT - 80; row += 128)
      features.push({ col: Math.floor((i * MAP_WIDTH) / 5), row, kind: 'frontier-marker' });
  const spawn =
    settlements.find((s) => s.countryId === countries[0].id && s.kind === 'village') ??
    settlements[0]!;
  return {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    seed,
    countries,
    settlements,
    roads,
    features,
    spawn: { col: spawn.col, row: spawn.row },
    tiles: [],
    overlays,
    chunkCache: new Map()
  };
}
export function tileAt(map: WorldMap, point: Point): Tile | undefined {
  if (point.col < 0 || point.row < 0 || point.col >= map.width || point.row >= map.height) return;
  const chunk = `${Math.floor(point.col / CHUNK_SIZE)},${Math.floor(point.row / CHUNK_SIZE)}`;
  const id = k(point);
  const cached = map.chunkCache?.get(chunk)?.get(id);
  if (cached) return cached;
  const legacy = map.tiles?.[point.row * map.width + point.col];
  if (legacy) return legacy;
  const tile = map.overlays?.get(id) ?? baseTile(map, point);
  let c = map.chunkCache?.get(chunk);
  if (!c) {
    c = new Map();
    map.chunkCache?.set(chunk, c);
  }
  c.set(id, tile);
  return tile;
}

/** Release generated tiles for chunks that are no longer streamed. */
export function evictChunkCache(map: WorldMap, neededChunks: ReadonlySet<string>) {
  for (const id of map.chunkCache?.keys() ?? []) {
    if (!neededChunks.has(id)) map.chunkCache?.delete(id);
  }
}

/** Return the chunk rectangle intersecting a viewport, plus guard chunks. */
export function chunkRangeForViewport(
  map: Pick<WorldMap, 'width' | 'height'>,
  camera: { x: number; y: number },
  viewport: { width: number; height: number },
  guard = 1
) {
  const chunkPixels = CHUNK_SIZE * TILE_SIZE;
  const maxCol = Math.ceil(map.width / CHUNK_SIZE) - 1;
  const maxRow = Math.ceil(map.height / CHUNK_SIZE) - 1;
  const left = Math.floor(Math.max(0, -camera.x) / chunkPixels) - guard;
  const top = Math.floor(Math.max(0, -camera.y) / chunkPixels) - guard;
  const right = Math.floor(Math.max(0, -camera.x + viewport.width - 1) / chunkPixels) + guard;
  const bottom = Math.floor(Math.max(0, -camera.y + viewport.height - 1) / chunkPixels) + guard;
  return {
    left: Math.max(0, left),
    top: Math.max(0, top),
    right: Math.min(maxCol, right),
    bottom: Math.min(maxRow, bottom)
  };
}
export function clampPoint(map: WorldMap, point: Point): Point {
  return {
    col: Math.max(0, Math.min(map.width - 1, point.col)),
    row: Math.max(0, Math.min(map.height - 1, point.row))
  };
}
