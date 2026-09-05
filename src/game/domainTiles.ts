import type { TileKind } from './types';
export const isRoadSurface = (kind: TileKind | undefined) => kind === 'road' || kind === 'bridge';
export const isTraversableRoute = (kind: TileKind | undefined) => isRoadSurface(kind) || kind === 'gate';
export const blockedTileKinds = new Set<TileKind>(['water', 'rock', 'hill', 'house', 'wall', 'tower']);
