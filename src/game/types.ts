export type Point = { col: number; row: number };
export type TileKind = 'grass' | 'flower' | 'water' | 'rock';
export type Tile = Point & { kind: TileKind; walkable: boolean };
export type WorldMap = { width: number; height: number; tiles: Tile[]; spawn: Point };
