import { describe, expect, it } from 'vitest';
import { acceptsPointer, tilePointFromPointer } from './input';

describe('pointer input adapter', () => {
  it('translates client coordinates after camera and element offsets', () => {
    expect(
      tilePointFromPointer({
        clientX: 100,
        clientY: 80,
        rect: { left: 10, top: 8 },
        camera: { x: -48, y: -24 }
      })
    ).toEqual({ col: 2, row: 2 });
  });
  it('accepts touch and primary clicks only', () => {
    expect(acceptsPointer('touch', 0)).toBe(true);
    expect(acceptsPointer('mouse', 0)).toBe(true);
    expect(acceptsPointer('mouse', 2)).toBe(false);
  });
});
