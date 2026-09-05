import type { Point } from './types';
import { GENERATOR_VERSION } from './worldConstants';

const ROUTE_MIN_RUN = 3;
const ROUTE_MAX_RUN = 8;
const hash = (seed: number, col: number, row: number) => {
  let h = (seed ^ (col * 374761393) ^ (row * 668265263) ^ (GENERATOR_VERSION * 1442695041)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
};

export function generateRoutePoints(seed: number, a: Point, b: Point): Point[] {
  const routeSeed =
    (seed ^
      Math.imul(a.col, 374761393) ^
      Math.imul(a.row, 668265263) ^
      Math.imul(b.col, 1274126177) ^
      Math.imul(b.row, 2246822519)) >>>
    0;
  const points: Point[] = [{ ...a }];
  let col = a.col;
  let row = a.row;
  let segment = 0;
  while (col !== b.col || row !== b.row) {
    const horizontalDistance = Math.abs(b.col - col);
    const verticalDistance = Math.abs(b.row - row);
    const totalDistance = horizontalDistance + verticalDistance;
    const horizontal =
      horizontalDistance > 0 &&
      (verticalDistance === 0 ||
        hash(routeSeed, segment, 7919) < horizontalDistance / totalDistance);
    const distance = horizontal ? horizontalDistance : verticalDistance;
    const run = Math.min(
      distance,
      ROUTE_MIN_RUN +
        Math.floor(
          hash(routeSeed ^ 0x9e3779b9, segment, 1543) * (ROUTE_MAX_RUN - ROUTE_MIN_RUN + 1)
        )
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
