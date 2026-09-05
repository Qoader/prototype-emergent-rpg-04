/** Compatibility surface for map consumers. Authoring lives in worldGeneration. */
export {
  CHUNK_SIZE,
  GENERATOR_VERSION,
  MAP_HEIGHT,
  MAP_WIDTH,
  TILE_SIZE,
  clampPoint,
  chunkRangeForViewport,
  createMap,
  evictChunkCache,
  tileAt
} from './worldGeneration';
export { generateRoutePoints } from './routes';
