import { describe, expect, it } from 'vitest';
import { createMap } from './map';
import { findPath } from './pathfinding';

describe('heroic fantasy world generation', () => {
  it('is deterministic and creates five complete realms', () => {
    const first = createMap();
    const second = createMap();
    expect(first).toEqual(second);
    expect(first.countries).toHaveLength(5);
    for (const country of first.countries ?? []) {
      const places = first.settlements?.filter((place) => place.countryId === country.id) ?? [];
      expect(places.filter((place) => place.kind === 'capital')).toHaveLength(1);
      expect(places.filter((place) => place.kind === 'city').length).toBeGreaterThanOrEqual(2);
      expect(places.filter((place) => place.kind === 'village')).toHaveLength(6);
    }
  });

  it('starts in a village with a traversable route to a city', () => {
    const map = createMap();
    const start = map.settlements?.find((place) => place.col === map.spawn.col && place.row === map.spawn.row);
    const city = map.settlements?.find((place) => place.countryId === start?.countryId && place.kind === 'city');
    expect(start?.kind).toBe('village');
    expect(city).toBeDefined();
    expect(findPath(map, map.spawn, city!)).not.toBeNull();
  });

  it('links every capital into the road network and marks frontiers', () => {
    const map = createMap();
    const capitals = map.settlements?.filter((place) => place.kind === 'capital') ?? [];
    for (const capital of capitals) expect(findPath(map, map.spawn, capital)).not.toBeNull();
    expect(map.features?.filter((feature) => feature.kind === 'gate')).toHaveLength(4);
  });
});
