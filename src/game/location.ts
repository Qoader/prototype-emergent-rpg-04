import type { Point, WorldMap } from './types';
import { tileAt } from './map';

export type Location = { id: string; label: string } | null;

/** Pure world query; presentation and timer policy belong to the UI boundary. */
export function locationAt(map: WorldMap, point: Point): Location {
  const tile = tileAt(map, point);
  const settlement =
    tile?.settlementId && map.settlements?.find((place) => place.id === tile.settlementId);
  if (settlement) return { id: settlement.id, label: `${settlement.name} · ${settlement.kind}` };
  const country = tile?.countryId && map.countries?.find((realm) => realm.id === tile.countryId);
  return country ? { id: country.id, label: country.name } : null;
}
