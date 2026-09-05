import { describe, expect, it } from 'vitest';
import { createMap } from './map';
import { locationAt } from './location';

describe('location queries', () => {
  it('prefers settlement metadata and falls back to country metadata', () => {
    const map = createMap();
    const settlement = map.settlements![0]!;
    expect(locationAt(map, settlement)).toEqual({ id: settlement.id, label: `${settlement.name} · ${settlement.kind}` });
    const wilderness = { col: 100, row: 100 };
    const location = locationAt(map, wilderness);
    expect(location?.id).toBe(map.countries![0]!.id);
  });
});
