import { Container, Graphics } from 'pixi.js';
import { TILE_SIZE } from './map';
import type { Point } from './types';
import { tileKey } from './worldCoordinates';
import type { WorldViewport } from './worldObservation';

const WIDTH = 16;
const HEIGHT = 14;
const INSET = 3;

function chestAt(tile: Readonly<Point>) {
  const view = new Graphics();
  view.label = 'search-cue-chest';
  // Lid, body, two bands and a latch: intentionally static pixel-style geometry.
  // Half-pixel one-pixel outlines retain a 16×14 visual footprint.
  view.rect(.5, .5, WIDTH - 1, HEIGHT - 1).fill('#75452d').stroke({ color: '#251a1a', width: 1 });
  view.rect(.5, 1.5, WIDTH - 1, 5).fill('#9b6038').stroke({ color: '#251a1a', width: 1 });
  view.rect(3, 1, 2, 13).fill('#d5aa57');
  view.rect(11, 1, 2, 13).fill('#d5aa57');
  view.rect(6, 6, 4, 4).fill('#f3d779').stroke({ color: '#251a1a', width: 1 });
  view.position.set((tile.col + 1) * TILE_SIZE - INSET - WIDTH, (tile.row + 1) * TILE_SIZE - INSET - HEIGHT);
  view.eventMode = 'none';
  return view;
}

/** Chest visibility uses its own 16×14 bottom-right footprint, not the tile. */
export function chestBoundsIntersectViewport(tile: Readonly<Point>, viewport: Readonly<WorldViewport>) {
  const left = (tile.col + 1) * TILE_SIZE - INSET - WIDTH;
  const top = (tile.row + 1) * TILE_SIZE - INSET - HEIGHT;
  return left + WIDTH > viewport.left && left < viewport.right && top + HEIGHT > viewport.top && top < viewport.bottom;
}

export function createSearchCueView() {
  const view = new Container();
  view.label = 'search-cue-overlay';
  view.eventMode = 'none';
  const chests = new Map<string, Graphics>();
  let destroyed = false;
  return {
    view,
    update(tiles: readonly Point[], viewport: Readonly<WorldViewport>) {
      if (destroyed) return;
      const visible = new Map(tiles.filter((tile) => chestBoundsIntersectViewport(tile, viewport)).map((tile) => [tileKey(tile), tile]));
      for (const [key, chest] of chests)
        if (!visible.has(key)) { chest.destroy(); chests.delete(key); }
      for (const [key, tile] of visible)
        if (!chests.has(key)) { const chest = chestAt(tile); view.addChild(chest); chests.set(key, chest); }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      chests.clear();
      view.destroy({ children: true });
    }
  };
}
