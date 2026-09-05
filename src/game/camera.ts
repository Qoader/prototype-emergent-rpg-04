import type { Point } from './types';

export type Viewport = { width: number; height: number };
export type Camera = { x: number; y: number };

/** Centers the player while keeping the world edges in the viewport. */
export function cameraForPlayer(
  player: Readonly<{ x: number; y: number }> | Readonly<Point>,
  world: { width: number; height: number },
  viewport: Viewport,
  tileSize: number
): Camera {
  const x = 'x' in player ? player.x : player.col + 0.5;
  const y = 'y' in player ? player.y : player.row + 0.5;
  return {
    x: Math.min(
      0,
      Math.max(viewport.width - world.width * tileSize, viewport.width / 2 - x * tileSize)
    ),
    y: Math.min(
      0,
      Math.max(viewport.height - world.height * tileSize, viewport.height / 2 - y * tileSize)
    )
  };
}
