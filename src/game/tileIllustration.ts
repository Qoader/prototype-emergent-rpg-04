import { Graphics } from 'pixi.js';
import type { FillInput } from 'pixi.js';
import type { CardinalDirection, Country, GroundKind, Tile, TileKind, WorldMap } from './types';
import { TILE_SIZE, tileAt } from './map';

const PATH_WIDTH = 26;
const colors: Record<TileKind, string> = {
  grass: '#5f9165', flower: '#7fa56e', water: '#3c7798', rock: '#77777a', forest: '#416d54',
  hill: '#7f875f', sand: '#c7a96d', road: '#b89462', bridge: '#8b623e', house: '#8b684f', wall: '#77736b', gate: '#77736b', tower: '#68655f',
};
const variation = (col: number, row: number) => Math.abs((col * 13 + row * 7) % 11);
const isRoute = (kind: TileKind | undefined) => kind === 'road' || kind === 'bridge' || kind === 'gate';

export type RouteConnections = { north: boolean; east: boolean; south: boolean; west: boolean };
export type FortificationOrientation = 'horizontal' | 'vertical' | 'corner';
export type FortificationSection = 'all' | 'upper' | 'lower';

export const isOverhangingTerrain = (kind: TileKind): kind is Extract<TileKind, 'forest' | 'rock' | 'hill' | 'wall' | 'gate' | 'tower'> => kind === 'forest' || kind === 'rock' || kind === 'hill' || kind === 'wall' || kind === 'gate' || kind === 'tower';
export const overhangZIndex = (ownerRow: number): number => ownerRow * TILE_SIZE + 1;
export const fortificationSectionZIndex = (ownerRow: number, section: Exclude<FortificationSection, 'all'>): number =>
  section === 'upper' ? ownerRow * TILE_SIZE - 1 : (ownerRow + 1) * TILE_SIZE - 1;

export function routeConnections(map: WorldMap, point: { col: number; row: number }): RouteConnections {
  return {
    north: isRoute(tileAt(map, { col: point.col, row: point.row - 1 })?.kind),
    east: isRoute(tileAt(map, { col: point.col + 1, row: point.row })?.kind),
    south: isRoute(tileAt(map, { col: point.col, row: point.row + 1 })?.kind),
    west: isRoute(tileAt(map, { col: point.col - 1, row: point.row })?.kind),
  };
}

const neutralCountry: Pick<Country, 'color' | 'banner'> = { color: '#777b82', banner: '#ded7c5' };

function settlementFor(tile: Tile, map?: WorldMap) {
  return map?.settlements?.find((settlement) => settlement.id === tile.settlementId);
}

export function fortificationOrientation(tile: Tile, map?: WorldMap): FortificationOrientation {
  const settlement = settlementFor(tile, map);
  if (settlement) {
    const { left, top, right, bottom } = settlement.bounds;
    const horizontal = tile.row === top || tile.row === bottom;
    const vertical = tile.col === left || tile.col === right;
    if (horizontal && vertical) return 'corner';
    if (horizontal) return 'horizontal';
    if (vertical) return 'vertical';
  }
  const neighbors = map ? routeConnections(map, tile) : { north: false, east: false, south: false, west: false };
  if (tile.kind === 'gate') {
    if ((neighbors.north || neighbors.south) && !(neighbors.east || neighbors.west)) return 'horizontal';
    if ((neighbors.east || neighbors.west) && !(neighbors.north || neighbors.south)) return 'vertical';
  } else if (map) {
    const northSouth = [tileAt(map, { col: tile.col, row: tile.row - 1 }), tileAt(map, { col: tile.col, row: tile.row + 1 })].some((candidate) => candidate?.kind === 'wall');
    const eastWest = [tileAt(map, { col: tile.col - 1, row: tile.row }), tileAt(map, { col: tile.col + 1, row: tile.row })].some((candidate) => candidate?.kind === 'wall');
    if (northSouth && !eastWest) return 'vertical';
  }
  return 'horizontal';
}

export function fortificationPalette(tile: Tile, map?: WorldMap): Pick<Country, 'color' | 'banner'> {
  const settlement = settlementFor(tile, map);
  const country = map?.countries?.find((candidate) => candidate.id === settlement?.countryId);
  return country ? { color: country.color, banner: country.banner } : neutralCountry;
}

function drawGround(graphics: Graphics, kind: GroundKind, ox: number, oy: number, seed: number, detail: boolean): void {
  const rect = (x: number, y: number, width: number, height: number, fill: FillInput) => graphics.rect(ox + x, oy + y, width, height).fill(fill);
  const circle = (x: number, y: number, radius: number, fill: FillInput) => graphics.circle(ox + x, oy + y, radius).fill(fill);
  const poly = (points: number[], fill: FillInput) => graphics.poly(points.map((point, index) => point + (index % 2 ? oy : ox))).fill(fill);
  rect(0, 0, TILE_SIZE, TILE_SIZE, colors[kind]);
  if (!detail) return;
  if (kind === 'grass') {
    rect(3 + seed, 7 + (seed % 4), 2, 7, '#4f825c'); rect(35 - (seed % 5), 30 + (seed % 6), 3, 2, '#77a66d'); rect(18 + (seed % 7), 40, 2, 4, '#4f825c');
  } else if (kind === 'flower') {
    const flowers = [[10 + seed % 5, 12], [31 - (seed % 4), 18 + seed % 6], [18 + (seed % 6), 36], [39 - (seed % 5), 38 - (seed % 4)]];
    for (const [x, y] of flowers) { rect(x, y + 3, 2, 5, '#477951'); circle(x + 1, y + 2, 3, seed % 2 ? '#f5cfba' : '#f1d98b'); circle(x + 1, y + 2, 1, '#d47b68'); }
  } else if (kind === 'water') {
    rect(0, 10 + seed, 48, 3, '#4d8dad'); rect(7, 28 - (seed % 5), 28, 3, '#2f6889'); rect(30 + (seed % 6), 39, 14, 2, '#6ca3b5');
  } else if (kind === 'sand') {
    rect(6 + seed, 10, 4, 2, '#d9bd7b'); rect(29 - (seed % 6), 20 + seed % 5, 3, 3, '#b6945c'); rect(14, 37 - (seed % 4), 5, 2, '#d9bd7b'); rect(39, 39, 3, 3, '#b6945c');
  } else if (kind === 'house') {
    rect(2, 31, 44, 17, { color: '#264235', alpha: 0.22 }); rect(4, 19, 40, 27, seed % 2 ? '#c9a66f' : '#d5b47c'); poly([0, 20, 24, 0, 48, 20], seed % 3 === 0 ? '#7f4d45' : '#8f5a4b'); rect(20, 31, 8, 15, '#69513f'); rect(10, 27, 8, 8, '#6f9ba0'); rect(30, 27, 8, 8, '#6f9ba0'); rect(13, 29, 2, 4, '#d9cf9f'); rect(33, 29, 2, 4, '#d9cf9f');
  }
}

function drawOverhang(graphics: Graphics, kind: Extract<TileKind, 'forest' | 'rock' | 'hill'>, ox: number, oy: number): void {
  const rect = (x: number, y: number, width: number, height: number, fill: FillInput) => graphics.rect(ox + x, oy + y, width, height).fill(fill);
  const circle = (x: number, y: number, radius: number, fill: FillInput) => graphics.circle(ox + x, oy + y, radius).fill(fill);
  const poly = (points: number[], fill: FillInput) => graphics.poly(points.map((point, index) => point + (index % 2 ? oy : ox))).fill(fill);
  if (kind === 'rock') {
    poly([2, 40, 7, 18, 18, 8, 33, 12, 46, 38], '#606166'); poly([7, 18, 18, 8, 24, 17, 15, 22], '#99999a'); rect(5, 39, 39, 4, '#55565b');
  } else if (kind === 'forest') {
    rect(19, 27, 10, 17, '#654534'); circle(24, 17, 18, '#315b45'); circle(14, 25, 11, '#38664d'); circle(34, 25, 11, '#2d5943'); rect(8, 37, 32, 4, '#2b563f');
  } else {
    poly([0, 42, 10, 24, 23, 5, 38, 24, 48, 42], '#707852'); poly([23, 5, 38, 24, 29, 21], '#9aa06f'); rect(0, 40, 48, 8, '#69734f');
  }
}

function drawFlag(graphics: Graphics, x: number, y: number, country: Pick<Country, 'color' | 'banner'>): void {
  graphics.rect(x, y - 15, 2, 17).fill('#4d4438');
  graphics.poly([x + 2, y - 14, x + 12, y - 11, x + 2, y - 7]).fill(country.color);
  graphics.poly([x + 2, y - 8, x + 12, y - 5, x + 2, y - 4]).fill(country.banner);
}

function drawFortification(graphics: Graphics, kind: Extract<TileKind, 'wall' | 'gate' | 'tower'>, ox: number, oy: number, direction: CardinalDirection = 'south', orientation: FortificationOrientation = 'horizontal', country: Pick<Country, 'color' | 'banner'> = neutralCountry, section: FortificationSection = 'all'): void {
  const stone = kind === 'tower' ? '#5f5d58' : '#77736b'; const cap = kind === 'tower' ? '#464640' : '#5f5d57';
  if (kind === 'tower') { graphics.rect(ox + 8, oy - 30, 32, 14).fill(stone); graphics.rect(ox + 12, oy - 38, 24, 9).fill(cap); graphics.rect(ox + 18, oy - 8, 12, 14).fill('#3d3b38'); return; }
  const horizontal = orientation === 'horizontal';
  const drawWall = () => {
    if (horizontal) {
      graphics.rect(ox + 3, oy - 18, 42, 34).fill(stone); graphics.rect(ox + 3, oy - 18, 42, 6).fill(cap);
      for (let x = 7; x < 43; x += 12) graphics.rect(ox + x, oy - 25, 6, 7).fill(cap);
    } else {
      graphics.rect(ox + 17, oy - 24, 14, 48).fill(stone); graphics.rect(ox + 14, oy - 24, 20, 6).fill(cap);
      for (let y = -18; y < 22; y += 12) graphics.rect(ox + 14, oy + y, 6, 6).fill(cap);
    }
  };
  if (orientation === 'corner' && kind === 'wall') { drawWall(); drawFortification(graphics, kind, ox, oy, direction, 'vertical', country); return; }
  if (kind === 'wall') { drawWall(); return; }
  if (horizontal) {
    graphics.rect(ox + 3, oy - 18, 8, 34).fill(stone); graphics.rect(ox + 37, oy - 18, 8, 34).fill(stone); graphics.rect(ox + 3, oy - 18, 8, 6).fill(cap); graphics.rect(ox + 37, oy - 18, 8, 6).fill(cap);
    graphics.rect(ox + 7, oy - 25, 6, 7).fill(cap); graphics.rect(ox + 35, oy - 25, 6, 7).fill(cap);
    drawFlag(graphics, ox + 9, oy - 27, country); drawFlag(graphics, ox + 37, oy - 27, country);
  } else {
    if (section === 'all' || section === 'upper') {
      graphics.rect(ox + 17, oy - 24, 14, 35).fill(stone); graphics.rect(ox + 14, oy - 24, 20, 6).fill(cap);
      drawFlag(graphics, ox + 23, oy - 23, country);
    }
    if (section === 'all' || section === 'lower') {
      graphics.rect(ox + 17, oy + 37, 14, 11).fill(stone); graphics.rect(ox + 14, oy + 42, 20, 6).fill(cap);
      drawFlag(graphics, ox + 23, oy + 35, country);
    }
  }
}

function drawRoute(graphics: Graphics, tile: Tile, connections: RouteConnections, ox: number, oy: number, seed: number): void {
  const bridge = tile.kind === 'bridge';
  const fill = bridge ? '#8b623e' : '#b89462';
  const shadow = bridge ? '#68452f' : '#98744f';
  const rect = (x: number, y: number, width: number, height: number, color: FillInput) => graphics.rect(ox + x, oy + y, width, height).fill(color);
  const hasAny = connections.north || connections.east || connections.south || connections.west;
  const connectionCount = Number(connections.north) + Number(connections.east) + Number(connections.south) + Number(connections.west);
  if (connectionCount === 1 || !hasAny) graphics.circle(ox + 24, oy + 24, PATH_WIDTH / 2).fill(fill);
  else rect(11, 11, PATH_WIDTH, PATH_WIDTH, fill);
  if (connections.north) rect(11, 0, PATH_WIDTH, 24, fill);
  if (connections.east) rect(24, 11, 24, PATH_WIDTH, fill);
  if (connections.south) rect(11, 24, PATH_WIDTH, 24, fill);
  if (connections.west) rect(0, 11, 24, PATH_WIDTH, fill);
  if (bridge) {
    if (connections.east || connections.west) {
      for (let x = 2; x < 48; x += 8) rect(x, 11, 5, 26, x % 16 ? '#a8784b' : '#765136');
      if (!connections.north) rect(11, 8, 26, 3, shadow);
      if (!connections.south) rect(11, 37, 26, 3, shadow);
    }
    if (connections.north || connections.south) {
      for (let y = 2; y < 48; y += 8) rect(11, y, 26, 5, y % 16 ? '#a8784b' : '#765136');
      if (!connections.west) rect(8, 11, 3, 26, shadow);
      if (!connections.east) rect(37, 11, 3, 26, shadow);
    }
  } else {
    if (seed % 2 === 0) rect(19, 20, 3, 2, shadow); else rect(27, 28, 3, 2, shadow);
  }
}

/** Draw only the ground and route surface for one tile. */
export function drawTileGround(graphics: Graphics, tile: Tile, map: WorldMap): void {
  const ox = tile.col * TILE_SIZE; const oy = tile.row * TILE_SIZE; const seed = variation(tile.col, tile.row);
  if (isRoute(tile.kind)) {
    const fallback: GroundKind = tile.kind === 'bridge' ? 'water' : 'grass';
    drawGround(graphics, tile.groundKind ?? fallback, ox, oy, seed, tile.kind === 'bridge');
    drawRoute(graphics, tile, routeConnections(map, tile), ox, oy, seed);
  } else if (tile.kind === 'wall' || tile.kind === 'tower') drawGround(graphics, 'grass', ox, oy, seed, true);
  else drawGround(graphics, tile.kind, ox, oy, seed, true);
}

/** Draw a tree, rock, or mountain into a foreground batch, reaching into the cell above. */
export function drawTileOverhang(graphics: Graphics, tile: Tile, map?: WorldMap, section: FortificationSection = 'all'): void {
  if (!isOverhangingTerrain(tile.kind)) return;
  const ox = tile.col * TILE_SIZE; const oy = tile.row * TILE_SIZE;
  if (tile.kind === 'forest' || tile.kind === 'rock' || tile.kind === 'hill') drawOverhang(graphics, tile.kind, ox, oy - TILE_SIZE / 2);
  else {
    const gate = settlementFor(tile, map)?.gates.find((candidate) => candidate.col === tile.col && candidate.row === tile.row);
    const direction = gate?.direction ?? 'south';
    const orientation = tile.kind === 'tower' ? 'horizontal' : fortificationOrientation(tile, map);
    drawFortification(graphics, tile.kind, ox, oy, direction, orientation, fortificationPalette(tile, map), section);
  }
}

/** Draw one complete tile, retained for callers that do not need depth sorting. */
export function drawTileIllustration(graphics: Graphics, tile: Tile, map: WorldMap): void {
  drawTileGround(graphics, tile, map);
  drawTileOverhang(graphics, tile, map);
}
