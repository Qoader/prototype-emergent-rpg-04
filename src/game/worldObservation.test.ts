import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from './map';
import { tileCenterInViewport } from './worldObservation';

describe('tile-center observation', () => {
  it('uses half-open world pixel bounds', () => {
    const tile = { col: 1, row: 1 };
    const center = 1.5 * TILE_SIZE;
    expect(tileCenterInViewport(tile, { left: center, top: center, right: center + 1, bottom: center + 1 })).toBe(true);
    expect(tileCenterInViewport(tile, { left: 0, top: 0, right: center, bottom: center })).toBe(false);
  });
});
