import type { Country, RealmTheme, SettlementKind } from './types';

export const realms: readonly Omit<Country, 'id'>[] = [
  { name: 'Alderwyn', theme: 'highland', color: '#b95747', banner: '#f0c674' },
  { name: 'Thornmere', theme: 'forest', color: '#4c8763', banner: '#d6e2a4' },
  { name: 'Valedorn', theme: 'river', color: '#4d7da8', banner: '#e7d7a2' },
  { name: 'Caerwyn', theme: 'coastal', color: '#8a638e', banner: '#f0b27a' },
  { name: 'Sungate Marches', theme: 'marches', color: '#b98640', banner: '#f7df8d' }
];
export const settlementNames: Readonly<Pick<Record<SettlementKind, readonly string[]>, 'capital' | 'village'>> = {
  capital: ['Highcourt', 'Greenglen', 'Rivercrown', 'Seaward', 'Goldwatch'],
  village: ['Ashbrook', 'Cloverden', 'Fern Hollow', 'Littleford', 'Hearthstead', 'Pinecross', 'Millrun', 'Applewick', 'Dovefield', 'Brookhollow', 'Foxglove', 'Tansy Vale', 'Wrenfield', 'Meadowrun', 'Glimmerfen']
};
export type RealmSettlementPlan = { readonly cities: readonly [string, string]; readonly extraCity?: string };
export const realmSettlementPlans: readonly RealmSettlementPlan[] = [
  { cities: ['Briarhold', 'Mossford'], extraCity: 'Stonebridge' },
  { cities: ['Larkspur', 'Dunwall'] },
  { cities: ['Brightmere', 'Oakrest'], extraCity: 'Roseward' },
  { cities: ['Kingscross', 'Fairhaven'] },
  { cities: ['Willowgate', 'Amberfield'], extraCity: 'Sunspire' }
];
export const settlementDimensions: Readonly<Record<SettlementKind, number>> = { village: 13, city: 21, capital: 29 };
export type TerrainConfig = { flowerRate?: number; shares: Partial<Record<import('./types').TileKind, number>>; fallback: import('./types').TileKind };
export const terrainConfig: Readonly<Record<RealmTheme, TerrainConfig>> = {
  highland: { shares: { forest: 0.16, hill: 0.23, grass: 0.61 }, fallback: 'grass' },
  forest: { flowerRate: 0.14, shares: { forest: 0.60465, water: 0.06977, grass: 0.32558 }, fallback: 'grass' },
  river: { flowerRate: 0.14, shares: { water: 0.16279, forest: 0.12791, grass: 0.7093 }, fallback: 'grass' },
  coastal: { flowerRate: 0.14, shares: { water: 0.2093, sand: 0.11628, grass: 0.67442 }, fallback: 'grass' },
  marches: { flowerRate: 0.15, shares: { hill: 0.11765, grass: 0.21176, sand: 0.67059 }, fallback: 'sand' }
};
