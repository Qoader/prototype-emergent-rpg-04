import { describe, expect, it } from 'vitest';
import { generateRoutePoints } from './routes';

describe('route authoring', () => {
  it('is deterministic and monotonic', () => {
    const points = generateRoutePoints(7331, { col: 10, row: 20 }, { col: 70, row: 80 });
    expect(generateRoutePoints(7331, { col: 10, row: 20 }, { col: 70, row: 80 })).toEqual(points);
    expect(points.at(-1)).toEqual({ col: 70, row: 80 });
  });
});
