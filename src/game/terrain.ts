import type { Country, Point, Tile, TileKind } from './types';
import { MAP_WIDTH, GENERATOR_VERSION } from './worldConstants';
import { blockedTileKinds } from './domainTiles';
import { terrainConfig } from './worldConfig';

export type TerrainContext = { readonly seed: number; readonly width: number; readonly height: number; readonly countries: readonly Country[] };
export type TerrainSampler = { baseTile(point: Readonly<Point>): Tile };

export const hash = (seed: number, col: number, row: number) => {
  let h = (seed ^ (col * 374761393) ^ (row * 668265263) ^ (GENERATOR_VERSION * 1442695041)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
};
const smooth = (value: number) => value * value * (3 - 2 * value);
export const clusteredNoise = (seed: number, col: number, row: number, scale = 4) => {
  const gx = Math.floor(col / scale), gy = Math.floor(row / scale);
  const tx = smooth((col - gx * scale) / scale), ty = smooth((row - gy * scale) / scale);
  const at = (x: number, y: number) => hash(seed + 0x51ed270b, x * 17, y * 31);
  const north = at(gx, gy) * (1 - tx) + at(gx + 1, gy) * tx;
  const south = at(gx, gy + 1) * (1 - tx) + at(gx + 1, gy + 1) * tx;
  return north * (1 - ty) + south * ty;
};
const REGION_SCALE = 16, REGION_JITTER = 5, terrainSalt = 0x19a3;
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
const flowerPatchAt = (seed: number, point: Point, activation = 0.65625) => {
  const cellCol = Math.floor(point.col / 5), cellRow = Math.floor(point.row / 5);
  if (flowerHash(seed ^ 0x8badf00d, cellCol, cellRow) >= activation) return false;
  const anchor = { col: cellCol * 5 + 1, row: cellRow * 5 + 1 };
  const choice = Math.floor(flowerHash(seed ^ 0xa1b2c3d4, cellCol, cellRow) * flowerTemplates.length);
  const variant = Math.floor(flowerHash(seed ^ 0x31415926, cellCol, cellRow) * 8);
  const shape = flowerTemplates[choice]!.map((offset) => transformedFlowerPoint(offset, variant));
  const left = Math.min(...shape.map((p) => p.col)), top = Math.min(...shape.map((p) => p.row));
  return shape.some((p) => anchor.col + p.col - left === point.col && anchor.row + p.row - top === point.row);
};
const flowerAt = (seed: number, point: Point, isolatedRate: number, patchActivation: number) => {
  if (flowerPatchAt(seed, point, patchActivation)) return true;
  const single = (p: Point) => flowerHash(seed ^ 0x77aa11, p.col, p.row) < isolatedRate;
  if (!single(point)) return false;
  for (let row = point.row - 1; row <= point.row + 1; row += 1) for (let col = point.col - 1; col <= point.col + 1; col += 1) {
    if (col === point.col && row === point.row) continue;
    if (flowerPatchAt(seed, { col, row }, patchActivation) || (single({ col, row }) && flowerHash(seed ^ 0x77aa11, col, row) <= flowerHash(seed ^ 0x77aa11, point.col, point.row))) return false;
  }
  return true;
};
const regionFor = (seed: number, point: Point) => {
  const cellCol = Math.floor(point.col / REGION_SCALE), cellRow = Math.floor(point.row / REGION_SCALE);
  const regionSeed = (col: number, row: number) => ({ col: col * REGION_SCALE + Math.floor(hash(seed ^ 0x2c1b3c6d, col, row) * 11) - REGION_JITTER, row: row * REGION_SCALE + Math.floor(hash(seed ^ 0x7f4a7c15, col, row) * 11) - REGION_JITTER });
  let best = { cellCol, cellRow, distance: Number.POSITIVE_INFINITY };
  for (let row = cellRow - 1; row <= cellRow + 1; row += 1) for (let col = cellCol - 1; col <= cellCol + 1; col += 1) {
    const candidate = regionSeed(col, row), distance = (candidate.col - point.col) ** 2 + (candidate.row - point.row) ** 2;
    if (distance < best.distance || (distance === best.distance && (row < best.cellRow || (row === best.cellRow && col < best.cellCol)))) best = { cellCol: col, cellRow: row, distance };
  }
  return best;
};
export function createTerrainSampler(context: TerrainContext): TerrainSampler {
  const countryFor = (point: Point) => context.countries[Math.min(4, Math.floor(point.col / (MAP_WIDTH / 5)))] ?? context.countries[0]!;
  const wildernessKind = (point: Point): TileKind => {
    const country = countryFor(point), config = terrainConfig[country.theme];
    if (config.flowerRate && flowerAt(context.seed + country.id.length * 97, point, country.theme === 'marches' ? 0.067 : 0.061, country.theme === 'marches' ? 0.703125 : 0.65625)) return 'flower';
    const region = regionFor(context.seed + terrainSalt + country.id.length * 7919, point);
    const value = hash(context.seed + terrainSalt, region.cellCol, region.cellRow);
    let cursor = 0;
    for (const [kind, share] of Object.entries(config.shares)) { cursor += share; if (value < cursor) return kind as TileKind; }
    return config.fallback;
  };
  return { baseTile(point) {
    const country = countryFor(point), edge = point.col < 3 || point.row < 3 || point.col >= context.width - 3 || point.row >= context.height - 3;
    let kind: TileKind = edge ? 'water' : wildernessKind(point);
    if (!edge && country.theme === 'highland' && kind === 'grass') {
      const rockSeed = context.seed ^ 0x9d31, rock = hash(rockSeed, point.col, point.row);
      let eligible = rock < 0.045;
      for (let row = point.row - 1; row <= point.row + 1; row += 1) for (let col = point.col - 1; col <= point.col + 1; col += 1) {
        if (col === point.col && row === point.row) continue;
        if (wildernessKind({ col, row }) !== 'grass' || hash(rockSeed, col, row) < rock) eligible = false;
      }
      if (eligible) kind = 'rock';
    }
    return { col: point.col, row: point.row, kind, walkable: !blockedTileKinds.has(kind), countryId: country.id };
  } };
}
