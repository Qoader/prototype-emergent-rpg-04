import type { Graphics } from 'pixi.js';

export type ChunkResources = { ground: Graphics; depth: Graphics[] };

/** Owns the lifetime of graphics associated with streamed chunks. */
export function createChunkResourceRegistry() {
  const resources = new Map<string, ChunkResources>();
  return {
    get: (id: string) => resources.get(id),
    has: (id: string) => resources.has(id),
    set: (id: string, value: ChunkResources) => resources.set(id, value),
    values: () => resources.entries(),
    destroy(id: string) {
      const value = resources.get(id);
      if (!value) return;
      value.ground.destroy();
      for (const graphic of value.depth) graphic.destroy();
      resources.delete(id);
    },
    destroyAll() {
      for (const id of resources.keys()) this.destroy(id);
    }
  };
}
