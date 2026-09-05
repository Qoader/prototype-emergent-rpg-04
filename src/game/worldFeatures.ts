import type { Point, Settlement, WorldFeature } from './types';
import { MAP_HEIGHT, MAP_WIDTH } from './worldConstants';
export const createFrontierMarkers = (): WorldFeature[] => { const features: WorldFeature[] = []; for (let i = 1; i < 5; i += 1) for (let row = 80; row < MAP_HEIGHT - 80; row += 128) features.push({ col: Math.floor((i * MAP_WIDTH) / 5), row, kind: 'frontier-marker' }); return features; };
export const selectSpawn = (settlements: Settlement[], countryId: string): Point => { const spawn = settlements.find((s) => s.countryId === countryId && s.kind === 'village') ?? settlements[0]!; return { col: spawn.col, row: spawn.row }; };
