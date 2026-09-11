export type Point = { col: number; row: number };
export type TileKind =
  | 'grass'
  | 'flower'
  | 'water'
  | 'rock'
  | 'forest'
  | 'hill'
  | 'sand'
  | 'road'
  | 'bridge'
  | 'house'
  | 'wall'
  | 'gate'
  | 'tower';
export type GroundKind = Exclude<TileKind, 'road' | 'bridge' | 'wall' | 'gate' | 'tower'>;
export type Tile = Point & {
  kind: TileKind;
  walkable: boolean;
  groundKind?: GroundKind;
  countryId?: string;
  settlementId?: string;
  /** Captured source-coordinate decorative seed for battle scene reuse. */
  appearanceSeed?: number;
};
export type RouteConnections = { north: boolean; east: boolean; south: boolean; west: boolean };
export type FortificationOrientation = 'horizontal' | 'vertical' | 'corner-northwest' | 'corner-northeast' | 'corner-southwest' | 'corner-southeast';
export type CapturedTileAppearance = { tile: Tile; connections: RouteConnections; fortificationOrientation?: FortificationOrientation; palette?: Pick<Country, 'color' | 'banner'>; seed: number };

/** Read-only tile capability consumed by navigation and rendering. */
export type TileReader = {
  readonly width: number;
  readonly height: number;
  getTile(point: Readonly<Point>): Readonly<Tile> | undefined;
};

export type RealmTheme = 'highland' | 'forest' | 'river' | 'coastal' | 'marches';
export type Country = {
  id: string;
  name: string;
  theme: RealmTheme;
  color: string;
  banner: string;
};
export type SettlementKind = 'capital' | 'city' | 'village';
export type CardinalDirection = 'north' | 'east' | 'south' | 'west';
export type SettlementGate = Point & { id: string; direction: CardinalDirection };
export type WorldRoad = { id: string; settlementIds: [string, string] };
export type Settlement = Point & {
  id: string;
  name: string;
  kind: SettlementKind;
  countryId: string;
  radius: number;
  bounds: { left: number; top: number; right: number; bottom: number };
  gates: SettlementGate[];
};
export type WorldFeature = Point & { kind: 'frontier-marker' };
export type GoblinNest = Point & {
  id: string;
  spawnTiles: [Point, Point, Point];
};

export type WorldMap = {
  width: number;
  height: number;
  seed?: number;
  tiles: Tile[];
  overlays?: Map<string, Tile>;
  chunkCache?: Map<string, Map<string, Tile>>;
  spawn: Point;
  countries?: Country[];
  settlements?: Settlement[];
  roads?: WorldRoad[];
  features?: WorldFeature[];
  goblinNests?: GoblinNest[];
  /** Test-only authored fixtures may isolate a scripted duel. */
  disableBattleResponses?: boolean;
  /** Test-only: end the scripted encounter population after its outcome. */
  removeGoblinsAfterBattle?: boolean;
};
