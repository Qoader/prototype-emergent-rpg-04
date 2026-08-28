import type { Country, Point, RealmTheme, Settlement, SettlementKind, Tile, TileKind, WorldFeature, WorldMap } from './types';

export const TILE_SIZE = 24;
export const MAP_WIDTH = 160;
export const MAP_HEIGHT = 112;
const blocked = new Set<TileKind>(['water', 'rock', 'hill']);

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

export function createMap(seed = 7331): WorldMap {
  const tiles: Tile[] = []; let state = seed >>> 0;
  const random = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 0x100000000; };
  const countries = realms.map((realm, index) => ({ ...realm, id: `realm-${index}` }));
  const countryAt = (col: number) => countries[Math.min(countries.length - 1, Math.floor(col / (MAP_WIDTH / countries.length)))];
  const terrainFor = (theme: RealmTheme, roll: number): TileKind => {
    if (theme === 'highland') return roll < 0.11 ? 'rock' : roll < 0.34 ? 'hill' : roll < 0.5 ? 'forest' : 'grass';
    if (theme === 'forest') return roll < 0.52 ? 'forest' : roll < 0.66 ? 'flower' : roll < 0.72 ? 'water' : 'grass';
    if (theme === 'river') return roll < 0.14 ? 'water' : roll < 0.28 ? 'flower' : roll < 0.39 ? 'forest' : 'grass';
    if (theme === 'coastal') return roll < 0.18 ? 'water' : roll < 0.28 ? 'sand' : roll < 0.42 ? 'flower' : 'grass';
    return roll < 0.18 ? 'sand' : roll < 0.33 ? 'flower' : roll < 0.43 ? 'hill' : 'grass';
  };
  for (let row = 0; row < MAP_HEIGHT; row += 1) for (let col = 0; col < MAP_WIDTH; col += 1) {
    const edge = col < 3 || row < 3 || col >= MAP_WIDTH - 3 || row >= MAP_HEIGHT - 3;
    const country = countryAt(col); const kind = edge ? 'water' : terrainFor(country.theme, random());
    tiles.push({ col, row, kind, walkable: !blocked.has(kind), countryId: country.id });
  }
  const at = (point: Point) => tiles[point.row * MAP_WIDTH + point.col];
  const settlements: Settlement[] = [];
  const features: WorldFeature[] = [];
  const addSettlement = (country: Country, kind: SettlementKind, col: number, row: number, name: string) => {
    const radius = kind === 'capital' ? 4 : kind === 'city' ? 3 : 2;
    const settlement = { id: `${country.id}-${kind}-${settlements.length}`, name, kind, countryId: country.id, col, row, radius };
    settlements.push(settlement);
    for (let y = row - radius; y <= row + radius; y += 1) for (let x = col - radius; x <= col + radius; x += 1) {
      if (x < 3 || y < 3 || x >= MAP_WIDTH - 3 || y >= MAP_HEIGHT - 3 || Math.hypot(x - col, y - row) > radius + 0.25) continue;
      const tile = at({ col: x, row: y }); tile.kind = 'grass'; tile.walkable = true; tile.settlementId = settlement.id;
    }
    return settlement;
  };
  countries.forEach((country, index) => {
    const left = Math.floor(index * MAP_WIDTH / countries.length) + 6;
    const right = Math.floor((index + 1) * MAP_WIDTH / countries.length) - 7;
    const capital = addSettlement(country, 'capital', Math.round((left + right) / 2), 24 + (index % 2) * 48, settlementNames.capital[index]);
    const cities = [
      addSettlement(country, 'city', left + 4, 52 + ((index * 17) % 30), settlementNames.city[index * 2]),
      addSettlement(country, 'city', right - 3, 72 - ((index * 11) % 25), settlementNames.city[index * 2 + 1]),
    ];
    if (index % 2 === 0) cities.push(addSettlement(country, 'city', Math.round((left + right) / 2), 88, settlementNames.city[10 + index / 2]));
    const anchors = [capital, ...cities];
    for (let village = 0; village < 6; village += 1) {
      const anchor = anchors[village % anchors.length];
      const col = Math.max(left, Math.min(right, anchor.col + (village % 2 ? -7 : 7) + Math.floor(random() * 5)));
      const row = Math.max(8, Math.min(MAP_HEIGHT - 9, anchor.row + (village < 3 ? 11 : -11) + Math.floor(random() * 6)));
      addSettlement(country, 'village', col, row, settlementNames.village[index * 3 + village % 3]);
    }
  });
  const carveRoad = (from: Point, to: Point) => {
    let col = from.col; let row = from.row;
    const carve = () => { const tile = at({ col, row }); tile.kind = tile.kind === 'water' ? 'bridge' : 'road'; tile.walkable = true; };
    carve();
    while (col !== to.col || row !== to.row) { if (col !== to.col) col += Math.sign(to.col - col); else row += Math.sign(to.row - row); carve(); }
  };
  countries.forEach((country, index) => {
    const realmSettlements = settlements.filter((settlement) => settlement.countryId === country.id);
    const capital = realmSettlements.find((settlement) => settlement.kind === 'capital')!;
    const cities = realmSettlements.filter((settlement) => settlement.kind === 'city');
    cities.forEach((city) => carveRoad(capital, city));
    realmSettlements.filter((settlement) => settlement.kind === 'village').forEach((village, villageIndex) => carveRoad(village, cities[villageIndex % cities.length]));
    if (index > 0) {
      const previousCapital = settlements.find((settlement) => settlement.countryId === countries[index - 1].id && settlement.kind === 'capital')!;
      carveRoad(previousCapital, capital);
      features.push({ col: Math.floor(index * MAP_WIDTH / countries.length), row: capital.row, kind: 'gate' });
    }
  });
  for (let index = 1; index < countries.length; index += 1) for (let row = 12; row < MAP_HEIGHT - 12; row += 24) features.push({ col: Math.floor(index * MAP_WIDTH / countries.length), row, kind: 'frontier-marker' });
  const startingVillage = settlements.find((settlement) => settlement.countryId === countries[0].id && settlement.kind === 'village')!;
  return { width: MAP_WIDTH, height: MAP_HEIGHT, tiles, spawn: { col: startingVillage.col, row: startingVillage.row }, countries, settlements, features };
}

export function tileAt(map: WorldMap, point: Point): Tile | undefined { return point.col >= 0 && point.row >= 0 && point.col < map.width && point.row < map.height ? map.tiles[point.row * map.width + point.col] : undefined; }
export function clampPoint(map: WorldMap, point: Point): Point { return { col: Math.max(0, Math.min(map.width - 1, point.col)), row: Math.max(0, Math.min(map.height - 1, point.row)) }; }
