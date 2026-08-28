export type Point = { col: number; row: number };
export type TileKind = 'grass' | 'flower' | 'water' | 'rock' | 'forest' | 'hill' | 'sand' | 'road' | 'bridge';
export type Tile = Point & { kind: TileKind; walkable: boolean; countryId?: string; settlementId?: string };

export type RealmTheme = 'highland' | 'forest' | 'river' | 'coastal' | 'marches';
export type Country = { id: string; name: string; theme: RealmTheme; color: string; banner: string };
export type SettlementKind = 'capital' | 'city' | 'village';
export type Settlement = Point & { id: string; name: string; kind: SettlementKind; countryId: string; radius: number };
export type WorldFeature = Point & { kind: 'frontier-marker' | 'gate' };

export type WorldMap = {
  width: number;
  height: number;
  tiles: Tile[];
  spawn: Point;
  countries?: Country[];
  settlements?: Settlement[];
  features?: WorldFeature[];
};
