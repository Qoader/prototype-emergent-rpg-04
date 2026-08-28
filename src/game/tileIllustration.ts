import { Graphics } from 'pixi.js';
import type { FillInput } from 'pixi.js';
import type { TileKind } from './types';

const TILE_SIZE = 48;
const colors: Record<TileKind, string> = {
  grass: '#5f9165', flower: '#7fa56e', water: '#3c7798', rock: '#77777a', forest: '#416d54',
  hill: '#7f875f', sand: '#c7a96d', road: '#b89462', bridge: '#8b623e', house: '#8b684f',
};

const variation = (col: number, row: number) => Math.abs((col * 13 + row * 7) % 11);

/** Draw one complete 48x48 tile into a shared graphics batch. */
export function drawTileIllustration(graphics: Graphics, kind: TileKind, col: number, row: number): void {
  const ox = col * TILE_SIZE; const oy = row * TILE_SIZE; const seed = variation(col, row);
  const rect = (x: number, y: number, width: number, height: number, fill: FillInput) => graphics.rect(ox + x, oy + y, width, height).fill(fill);
  const circle = (x: number, y: number, radius: number, fill: FillInput) => graphics.circle(ox + x, oy + y, radius).fill(fill);
  const poly = (points: number[], fill: FillInput) => graphics.poly(points.map((point, index) => point + (index % 2 ? oy : ox))).fill(fill);
  rect(0, 0, TILE_SIZE, TILE_SIZE, colors[kind]);

  if (kind === 'grass') {
    rect(3 + seed, 7 + (seed % 4), 2, 7, '#4f825c'); rect(35 - (seed % 5), 30 + (seed % 6), 3, 2, '#77a66d'); rect(18 + (seed % 7), 40, 2, 4, '#4f825c');
  } else if (kind === 'flower') {
    const flowers = [[10 + seed % 5, 12], [31 - (seed % 4), 18 + seed % 6], [18 + (seed % 6), 36], [39 - (seed % 5), 38 - (seed % 4)]];
    for (const [x, y] of flowers) { rect(x, y + 3, 2, 5, '#477951'); circle(x + 1, y + 2, 3, seed % 2 ? '#f5cfba' : '#f1d98b'); circle(x + 1, y + 2, 1, '#d47b68'); }
  } else if (kind === 'water') {
    rect(0, 10 + seed, 48, 3, '#4d8dad'); rect(7, 28 - (seed % 5), 28, 3, '#2f6889'); rect(30 + (seed % 6), 39, 14, 2, '#6ca3b5');
  } else if (kind === 'rock') {
    poly([2, 40, 7, 18, 18, 8, 33, 12, 46, 38], '#606166'); poly([7, 18, 18, 8, 24, 17, 15, 22], '#99999a'); rect(5, 39, 39, 4, '#55565b');
  } else if (kind === 'forest') {
    rect(19, 27, 10, 17, '#654534'); circle(24, 17, 18, '#315b45'); circle(14, 25, 11, '#38664d'); circle(34, 25, 11, '#2d5943'); rect(8, 37, 32, 4, '#2b563f');
  } else if (kind === 'hill') {
    poly([0, 42, 10, 24, 23, 5, 38, 24, 48, 42], '#707852'); poly([23, 5, 38, 24, 29, 21], '#9aa06f'); rect(0, 40, 48, 8, '#69734f');
  } else if (kind === 'sand') {
    rect(6 + seed, 10, 4, 2, '#d9bd7b'); rect(29 - (seed % 6), 20 + seed % 5, 3, 3, '#b6945c'); rect(14, 37 - (seed % 4), 5, 2, '#d9bd7b'); rect(39, 39, 3, 3, '#b6945c');
  } else if (kind === 'road') {
    rect(0, 4, 48, 40, '#b89462'); rect(0, 6, 48, 3, '#d0af78'); rect(0, 39, 48, 3, '#98744f'); rect(9, 22, 11, 3, '#c8a875'); rect(29, 22, 10, 3, '#c8a875');
  } else if (kind === 'bridge') {
    rect(0, 3, 48, 42, '#8b623e'); for (let x = 2; x < 48; x += 8) rect(x, 4, 5, 40, x % 16 ? '#a8784b' : '#765136'); rect(0, 5, 48, 4, '#c18a53'); rect(0, 39, 48, 4, '#68452f');
  } else if (kind === 'house') {
    rect(2, 31, 44, 17, { color: '#264235', alpha: 0.22 }); rect(4, 19, 40, 27, seed % 2 ? '#c9a66f' : '#d5b47c'); poly([0, 20, 24, 0, 48, 20], seed % 3 === 0 ? '#7f4d45' : '#8f5a4b'); rect(20, 31, 8, 15, '#69513f'); rect(10, 27, 8, 8, '#6f9ba0'); rect(30, 27, 8, 8, '#6f9ba0'); rect(13, 29, 2, 4, '#d9cf9f'); rect(33, 29, 2, 4, '#d9cf9f');
  }
}
