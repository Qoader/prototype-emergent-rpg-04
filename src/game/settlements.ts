import type { Country, Settlement, SettlementKind } from './types';
import type { AuthoredTileEditor } from './authoredTiles';
import { MAP_HEIGHT, MAP_WIDTH } from './worldConstants';
import { realms, realmSettlementPlans, settlementDimensions, settlementNames } from './worldConfig';
export const createCountries = () => realms.map((realm, i) => ({ ...realm, id: `realm-${i}` }));
export function placeSettlements(editor: AuthoredTileEditor, countries: readonly Country[]): Settlement[] {
  const settlements: Settlement[] = [];
  const bounds = (kind: SettlementKind, col: number, row: number) => { const h = Math.floor(settlementDimensions[kind] / 2); return { left: col - h, top: row - h, right: col + h, bottom: row + h }; };
  const occupied = (b: ReturnType<typeof bounds>) => settlements.some((s) => b.left <= s.bounds.right + 3 && b.right + 3 >= s.bounds.left && b.top <= s.bounds.bottom + 3 && b.bottom + 3 >= s.bounds.top);
  const add = (country: Country, kind: SettlementKind, col: number, row: number, name: string) => { col = Math.round(col); row = Math.round(row); const b = bounds(kind, col, row); if (b.left < 3 || b.top < 3 || b.right >= MAP_WIDTH - 3 || b.bottom >= MAP_HEIGHT - 3 || occupied(b)) return; const s: Settlement = { id: `${country.id}-${kind}-${settlements.length}`, name, kind, countryId: country.id, col, row, radius: Math.floor(settlementDimensions[kind] / 2), bounds: b, gates: [] }; settlements.push(s); for (let y = b.top; y <= b.bottom; y += 1) for (let x = b.left; x <= b.right; x += 1) editor.put({ col: x, row: y }, { kind: 'grass', walkable: true, settlementId: s.id }); return s; };
  countries.forEach((country, i) => { const left = i * MAP_WIDTH / 5 + 40, right = (i + 1) * MAP_WIDTH / 5 - 40, center = Math.round((left + right) / 2), plan = realmSettlementPlans[i]!; add(country, 'capital', center, i % 2 ? 1500 : 500, settlementNames.capital[i]!); add(country, 'city', left + 100, 820 + (i % 2) * 180, plan.cities[0]); add(country, 'city', right - 100, 1120 - (i % 2) * 180, plan.cities[1]); if (plan.extraCity) add(country, 'city', center, 1650, plan.extraCity); const anchors = settlements.filter((s) => s.countryId === country.id && s.kind !== 'village'); for (let v = 0; v < 6; v += 1) { const q = anchors[v % anchors.length]!; add(country, 'village', q.col + (v % 2 ? -55 : 55), q.row + (v < 3 ? 110 : -110), settlementNames.village[i * 3 + v % 3]!); } });
  return settlements;
}
