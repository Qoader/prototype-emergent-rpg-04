import type { Point } from './types';

export const tileKey = (point: Readonly<Point>) => `${point.col},${point.row}`;
export const cardinalNeighbors = (point: Readonly<Point>): Point[] => [
  { col: point.col, row: point.row - 1 },
  { col: point.col + 1, row: point.row },
  { col: point.col, row: point.row + 1 },
  { col: point.col - 1, row: point.row }
];
export const containsPoint = (
  bounds: { left: number; top: number; right: number; bottom: number },
  point: Readonly<Point>
) => point.col >= bounds.left && point.col <= bounds.right && point.row >= bounds.top && point.row <= bounds.bottom;
