import type {
  CardinalDirection,
  Country,
  GroundKind,
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
export const GENERATOR_VERSION = 3;
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
function baseTile(map: WorldMap, p: Point): Tile {
  const country = map.countries?.[Math.min(4, Math.floor(p.col / (MAP_WIDTH / 5)))] ?? realms[0] as Country;
  const edge = p.col < 3 || p.row < 3 || p.col >= MAP_WIDTH - 3 || p.row >= MAP_HEIGHT - 3;
  const r = hash(map.seed ?? 7331, p.col, p.row);
  const t = country.theme;
  const kind: TileKind = edge
    ? 'water'
    : t === 'highland'
      ? r < 0.11
        ? 'rock'
        : r < 0.34
          ? 'hill'
          : r < 0.5
            ? 'forest'
            : 'grass'
      : t === 'forest'
        ? r < 0.52
          ? 'forest'
          : r < 0.66
            ? 'flower'
            : r < 0.72
              ? 'water'
              : 'grass'
        : t === 'river'
          ? r < 0.14
            ? 'water'
            : r < 0.28
              ? 'flower'
              : r < 0.39
                ? 'forest'
                : 'grass'
          : t === 'coastal'
            ? r < 0.18
              ? 'water'
              : r < 0.28
                ? 'sand'
                : r < 0.42
                  ? 'flower'
                  : 'grass'
            : r < 0.18
              ? 'sand'
              : r < 0.33
                ? 'flower'
                : r < 0.43
                  ? 'hill'
                  : 'grass';
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
    let p = { ...a };
    let guard = 0;
    while (p.col !== b.col && guard++ < MAP_WIDTH + 4) {
      p = { col: p.col + Math.sign(b.col - p.col), row: p.row };
      const old = baseTile(
        { seed, countries, width: MAP_WIDTH, height: MAP_HEIGHT } as WorldMap,
        p
      );
      put(p, {
        kind: old.kind === 'water' ? 'bridge' : 'road',
        walkable: true,
        groundKind: old.kind as GroundKind
      });
    }
    guard = 0;
    while (p.row !== b.row && guard++ < MAP_HEIGHT + 4) {
      p = { col: p.col, row: p.row + Math.sign(b.row - p.row) };
      const old = baseTile(
        { seed, countries, width: MAP_WIDTH, height: MAP_HEIGHT } as WorldMap,
        p
      );
      put(p, {
        kind: old.kind === 'water' ? 'bridge' : 'road',
        walkable: true,
        groundKind: old.kind as GroundKind
      });
    }
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
        )
          put({ col: x, row: y }, { kind: 'wall', walkable: false, settlementId: s.id });
  }
  // Reopen the authored road corridors after fortification walls are applied.
  // This preserves a guaranteed traversable spine through every settlement.
  for (const road of roads) {
    const a = settlements.find((s) => s.id === road.settlementIds[0]);
    const b = settlements.find((s) => s.id === road.settlementIds[1]);
    if (a && b) route(a, b);
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
  // Add a sparse, deterministic set of non-walkable house clusters inside
  // every settlement. Roads are authored first, so they always remain open.
  for (const settlement of settlements) {
    const { left, right, top, bottom } = settlement.bounds;
    for (let row = top + 3; row <= bottom - 3; row += 4) {
      for (let col = left + 3; col <= right - 3; col += 4) {
        if (Math.abs(col - settlement.col) <= 2 || Math.abs(row - settlement.row) <= 2) continue;
        const existing = overlays.get(k({ col, row }));
        if (existing?.kind === 'road' || existing?.kind === 'bridge' || existing?.kind === 'gate') continue;
        put({ col, row }, { kind: 'house', walkable: false, settlementId: settlement.id });
      }
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
