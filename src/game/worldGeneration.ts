import type { WorldMap } from './types';
import { MAP_HEIGHT, MAP_WIDTH } from './worldConstants';
import { createTerrainSampler } from './terrain';
import { createAuthoredTileEditor } from './authoredTiles';
import { createCountries, placeSettlements } from './settlements';
import { connectSettlements, normalizeRoadOverlaps } from './roads';
import { authorFortifications, deriveGates, restoreFortifiedCorners } from './fortifications';
import { placeHousing } from './housing';
import { createFrontierMarkers, selectSpawn } from './worldFeatures';
export { CHUNK_SIZE, GENERATOR_VERSION, MAP_HEIGHT, MAP_WIDTH, TILE_SIZE } from './worldConstants';
export { tileAt, evictChunkCache, chunkRangeForViewport, clampPoint } from './worldTiles';

export function createWorld(seed = 7331): WorldMap {
  const countries = createCountries();
  const terrain = createTerrainSampler({ seed, width: MAP_WIDTH, height: MAP_HEIGHT, countries });
  const editor = createAuthoredTileEditor(terrain);
  const settlements = placeSettlements(editor, countries);
  const routeStage = connectSettlements(editor, settlements, seed, countries);
  authorFortifications(editor, settlements);
  routeStage.reopenRoadCorridors();
  restoreFortifiedCorners(editor, settlements);
  normalizeRoadOverlaps(editor, settlements, seed);
  deriveGates(editor, settlements);
  placeHousing(editor, settlements, seed);
  const features = createFrontierMarkers();
  return { width: MAP_WIDTH, height: MAP_HEIGHT, seed, countries, settlements, roads: routeStage.roads, features, spawn: selectSpawn(settlements, countries[0]!.id), tiles: [], overlays: new Map(editor.entries()), chunkCache: new Map() };
}
export const createMap = createWorld;
