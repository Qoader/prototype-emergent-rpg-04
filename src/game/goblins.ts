import { advanceMovement, createMovement, type Facing, type Movement } from './movement';
import { findPath, type SearchBounds } from './pathfinding';
import { isRoadSurface } from './domainTiles';
import type { GoblinNest, Point, Settlement, TileReader } from './types';

export type GoblinTarget = { id: string; kind: 'player' | 'adventurer'; tile: Point; position?: { x: number; y: number } };
export type GoblinPhase = 'roaming' | 'pursuing' | 'returning';
export type GoblinSnapshot = { id: string; nestId: string; position: { x: number; y: number }; tile: Point; facing: Facing; walking: boolean; phase: GoblinPhase; targetId: string | null };
export type GoblinSimulation = ReturnType<typeof createGoblinSimulation>;
const ROAM_RADIUS = 16;
const DETECTION_RADIUS = 8;
const ROAM_SPEED = 3;
const PURSUIT_SPEED = 6;
const MEMORY_SECONDS = 3;
const DECISION_INTERVAL = 0.2;
const key = (p: Point) => `${p.col},${p.row}`;
const distanceSquared = (a: Point, b: Point) => (a.col - b.col) ** 2 + (a.row - b.row) ** 2;
const randomFor = (seed: number, id: string) => { let value = (seed ^ 2166136261) >>> 0; for (const char of id) value = Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0; return () => { value = Math.imul(value ^ (value >>> 15), 2246822519) >>> 0; value = Math.imul(value ^ (value >>> 13), 3266489917) >>> 0; return ((value ^ (value >>> 16)) >>> 0) / 0x100000000; }; };

export function createGoblinSimulation(options: { seed?: number; nests: readonly GoblinNest[]; tiles: TileReader; settlements?: readonly Settlement[] }) {
  const { tiles, settlements = [] } = options;
  type State = { id: string; nest: GoblinNest; home: Point; movement: Movement; random: () => number; phase: GoblinPhase; targetId: string | null; lastSeen: Point | null; unseen: number; decision: number; pause: number; trail: Point[]; trailIndex: Map<string, number>; destination: Point | null };
  const states: State[] = [];
  const roamingTiles = new Map<string, Point[]>();
  const isInSettlement = (p: Point) => settlements.some((s) => p.col >= s.bounds.left && p.col <= s.bounds.right && p.row >= s.bounds.top && p.row <= s.bounds.bottom);
  const awayFromRoad = (p: Point) => { for (let row = p.row - 3; row <= p.row + 3; row += 1) for (let col = p.col - 3; col <= p.col + 3; col += 1) if (distanceSquared(p, { col, row }) <= 3 ** 2 && isRoadSurface(tiles.getTile({ col, row })?.kind)) return false; return true; };
  const roamingAllowed = (nest: GoblinNest, p: Point) => { const tile = tiles.getTile(p); return Boolean(tile?.walkable) && !isInSettlement(p) && awayFromRoad(p) && distanceSquared(nest, p) <= ROAM_RADIUS ** 2; };
  const getRoamingTiles = (nest: GoblinNest) => { const existing = roamingTiles.get(nest.id); if (existing) return existing; const result: Point[] = []; for (let row = Math.max(0, nest.row - ROAM_RADIUS); row <= Math.min(tiles.height - 1, nest.row + ROAM_RADIUS); row += 1) for (let col = Math.max(0, nest.col - ROAM_RADIUS); col <= Math.min(tiles.width - 1, nest.col + ROAM_RADIUS); col += 1) { const point = { col, row }; if (roamingAllowed(nest, point)) result.push(point); } roamingTiles.set(nest.id, result); return result; };
  for (const nest of options.nests) for (let index = 0; index < nest.spawnTiles.length; index += 1) { const id = `goblin-${nest.id}-${index}`; const spawn = nest.spawnTiles[index]!; states.push({ id, nest, home: { ...spawn }, movement: createMovement(spawn), random: randomFor(options.seed ?? 0, id), phase: 'roaming', targetId: null, lastSeen: null, unseen: 0, decision: (index * 0.07) % DECISION_INTERVAL, pause: 0, trail: [spawn], trailIndex: new Map([[key(spawn), 0]]), destination: null }); }
  const chooseTarget = (state: State, targets: readonly GoblinTarget[]) => targets.filter((target) => distanceSquared(state.movement.tile, target.tile) <= DETECTION_RADIUS ** 2).sort((a, b) => distanceSquared(state.movement.tile, a.tile) - distanceSquared(state.movement.tile, b.tile) || a.id.localeCompare(b.id))[0];
  const setRoute = (state: State, route: Point[], destination: Point | null) => { state.movement.route = route; state.destination = destination; state.movement.destination = destination; };
  const pursuitBounds = (a: Point, b: Point): SearchBounds => ({ minCol: Math.max(0, Math.min(a.col, b.col) - ROAM_RADIUS), maxCol: Math.min(tiles.width - 1, Math.max(a.col, b.col) + ROAM_RADIUS), minRow: Math.max(0, Math.min(a.row, b.row) - ROAM_RADIUS), maxRow: Math.min(tiles.height - 1, Math.max(a.row, b.row) + ROAM_RADIUS) });
  const roamingAllowedFor = (nest: GoblinNest | null, p: Point) => {
    const tile = tiles.getTile(p);
    if (!tile?.walkable || isInSettlement(p) || !awayFromRoad(p)) return false;
    return !nest || distanceSquared(nest, p) <= ROAM_RADIUS ** 2;
  };
  const routeTo = (state: State, destination: Point, bounded = false, roaming = false) => findPath(roaming ? { width: tiles.width, height: tiles.height, getTile: (point) => roamingAllowedFor(state.nest, point) ? tiles.getTile(point) : undefined } : tiles, state.movement.tile, destination, bounded ? pursuitBounds(state.movement.tile, destination) : undefined);
  const startReturn = (state: State) => {
    state.phase = 'returning'; state.targetId = null; state.lastSeen = null;
    const currentIndex = state.trail.findIndex((point) => key(point) === key(state.movement.tile));
    const trailRoute = currentIndex >= 0 ? state.trail.slice(0, currentIndex).reverse() : [];
    const route = trailRoute.length && trailRoute.every((point) => tiles.getTile(point)?.walkable) ? trailRoute : routeTo(state, state.home);
    setRoute(state, route ?? [], state.home);
  };
  const decide = (state: State, targets: readonly GoblinTarget[]) => {
    const current = state.targetId ? targets.find((target) => target.id === state.targetId) : undefined;
    const visible = current && distanceSquared(state.movement.tile, current.tile) <= DETECTION_RADIUS ** 2 ? current : state.phase === 'pursuing' ? undefined : chooseTarget(state, targets);
    if (visible) { state.phase = 'pursuing'; state.targetId = visible.id; state.lastSeen = { ...visible.tile }; state.unseen = 0; const route = routeTo(state, visible.tile, true); if (route) setRoute(state, route, visible.tile); return; }
    if (state.phase === 'pursuing') { state.unseen += DECISION_INTERVAL; if (state.unseen >= MEMORY_SECONDS) { startReturn(state); return; } if (state.lastSeen && (!state.destination || key(state.destination) !== key(state.lastSeen))) { const route = routeTo(state, state.lastSeen, true); if (route) setRoute(state, route, state.lastSeen); } return; }
    if (state.phase === 'returning') { if (!state.movement.route.length && key(state.movement.tile) === key(state.home)) { state.phase = 'roaming'; state.pause = 1; } return; }
    if (state.pause > 0) return;
    const candidates = getRoamingTiles(state.nest).filter((point) => key(point) !== key(state.movement.tile));
    const destination = candidates[Math.floor(state.random() * candidates.length)];
    if (!destination) { state.pause = 1; return; }
    const route = routeTo(state, destination, false, true); if (route) setRoute(state, route, destination); else state.pause = 1;
  };
  const step = (state: State, dt: number, targets: readonly GoblinTarget[]) => {
    const before = state.movement.tile;
    advanceMovement(state.movement, dt, state.phase === 'pursuing' ? PURSUIT_SPEED : ROAM_SPEED);
    if (key(before) !== key(state.movement.tile)) { const tileKey = key(state.movement.tile); const prior = state.trailIndex.get(tileKey); if (prior !== undefined) { state.trail.length = prior + 1; } else { state.trailIndex.set(tileKey, state.trail.length); state.trail.push({ ...state.movement.tile }); } }
    if (state.pause > 0) state.pause = Math.max(0, state.pause - dt);
    state.decision -= dt;
    if (state.decision <= 0) { state.decision += DECISION_INTERVAL; decide(state, targets); }
    if (state.phase === 'roaming' && !state.movement.route.length && state.destination) { state.destination = null; state.pause = 1 + state.random() * 2; }
  };
  let accumulator = 0;
  const tick = (deltaSeconds: number, targets: readonly GoblinTarget[] = []) => { accumulator += Math.min(Math.max(0, deltaSeconds), 0.1); while (accumulator >= 1 / 60) { for (const state of states) step(state, 1 / 60, targets); accumulator -= 1 / 60; } };
  const snapshots = () => states.map((state): GoblinSnapshot => ({ id: state.id, nestId: state.nest.id, position: { ...state.movement.position }, tile: { ...state.movement.tile }, facing: state.movement.facing, walking: state.movement.route.length > 0, phase: state.phase, targetId: state.targetId }));
  return { tick, snapshots };
}
