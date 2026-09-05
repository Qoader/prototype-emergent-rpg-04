import { describe, expect, it } from 'vitest';
import { createWorld } from './worldGeneration';

describe('world generation entrypoint', () => {
  it('preserves seeded metadata and the corrected fifth-realm city name', () => {
    const world = createWorld();
    expect(world.seed).toBe(7331);
    expect(world.countries).toHaveLength(5);
    expect(world.settlements?.some((place) => place.name === 'Sunspire')).toBe(true);
  });
});
