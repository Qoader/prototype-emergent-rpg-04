import { advanceMovement, createMovement, type Facing } from './movement';
import { isTraversableRoute } from './domainTiles';
import type { Point, Settlement, TileReader, WorldMap } from './types';

export type AdventurerPhase = 'roaming' | 'returning' | 'traveling';
export type AdventurerSnapshot = {
  id: string;
  position: { x: number; y: number };
  tile: Point;
  facing: Facing;
  walking: boolean;
  phase: AdventurerPhase;
  currentSettlementId: string | null;
  previousSettlementId: string | null;
  destinationSettlementId: string | null;
};

const SPEED = 3;
const key = (p: Point) => `${p.col},${p.row}`;
const dirs = [{ col: 0, row: -1 }, { col: 1, row: 0 }, { col: 0, row: 1 }, { col: -1, row: 0 }];
const randomRange = (r: () => number, min: number, max: number) => min + r() * (max - min);
const seeded = (seed: number, id: string) => {
  let h = (seed ^ 2166136261) >>> 0;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 0x100000000; };
};

function path(reader: TileReader, start: Point, goal: Point, allowed: (p: Point) => boolean, bounds?: Settlement['bounds']): Point[] | null {
  if (!allowed(start) || !allowed(goal)) return null;
  const queue = [start]; const came = new Map<string, Point>(); const seen = new Set([key(start)]);
  const inside = (p: Point) => !bounds || (p.col >= bounds.left && p.col <= bounds.right && p.row >= bounds.top && p.row <= bounds.bottom);
  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i]!;
    if (key(current) === key(goal)) { const route: Point[] = []; let c = current; while (key(c) !== key(start)) { route.unshift(c); c = came.get(key(c))!; } return route; }
    for (const d of dirs) { const n = { col: current.col + d.col, row: current.row + d.row }; if (!inside(n) || !reader.getTile(n)?.walkable || !allowed(n) || seen.has(key(n))) continue; seen.add(key(n)); came.set(key(n), current); queue.push(n); }
  }
  return null;
}

export function createAdventurerSimulation(map: WorldMap, reader: TileReader) {
  const settlements = [...(map.settlements ?? [])];
  const byId = new Map(settlements.map((s) => [s.id, s]));
  const adjacency = new Map<string, string[]>();
  for (const s of settlements) adjacency.set(s.id, []);
  for (const road of map.roads ?? []) { const [a, b] = road.settlementIds; if (byId.has(a) && byId.has(b)) { adjacency.get(a)!.push(b); adjacency.get(b)!.push(a); } }
  for (const values of adjacency.values()) values.sort();
  const states = settlements.map((settlement) => {
    const id = `adventurer-${settlement.id}`;
    const movement = createMovement({ col: settlement.col, row: settlement.row });
    const random = seeded(map.seed ?? 0, id);
    return { id, settlement, movement, random, phase: 'roaming' as AdventurerPhase, current: settlement.id as string | null, previous: null as string | null, destination: null as string | null, visit: randomRange(random, 0, 60), pause: 0, target: null as Point | null, finishingRoamStep: false };
  });
  const localTargets = new Map<string, Point[]>();
  const local = (s: Settlement) => {
    let result = localTargets.get(s.id); if (result) return result;
    result = [];
    const start = { col: s.col, row: s.row };
    if (!reader.getTile(start)?.walkable) return result;
    const queue = [start], seen = new Set([key(start)]);
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index]!;
      result.push(current);
      for (const d of dirs) {
        const next = { col: current.col + d.col, row: current.row + d.row };
        if (next.col < s.bounds.left || next.col > s.bounds.right || next.row < s.bounds.top || next.row > s.bounds.bottom || seen.has(key(next)) || !reader.getTile(next)?.walkable) continue;
        seen.add(key(next));
        queue.push(next);
      }
    }
    localTargets.set(s.id, result); return result;
  };
  const roadAllowed = (p: Point) => { const t = reader.getTile(p); if (!t?.walkable) return false; if (isTraversableRoute(t.kind)) return true; return settlements.some((s) => p.col >= s.bounds.left && p.col <= s.bounds.right && p.row >= s.bounds.top && p.row <= s.bounds.bottom); };
  const chooseTravel = (state: (typeof states)[number]) => {
    const candidates = [...new Set((adjacency.get(state.settlement.id) ?? []).filter((id) => byId.has(id)))];
    const alternatives = candidates.filter((id) => id !== state.previous);
    const options = alternatives.length ? alternatives : candidates;
    if (!options.length) return false;
    const pending = [...options];
    while (pending.length) {
      const destination = pending.splice(Math.floor(state.random() * pending.length), 1)[0]!;
      const target = byId.get(destination)!;
      const route = path(reader, state.movement.tile, { col: target.col, row: target.row }, roadAllowed);
      if (route) { state.destination = destination; state.previous = state.settlement.id; state.current = null; state.phase = 'traveling'; state.movement.route = route; state.movement.destination = { col: target.col, row: target.row }; return true; }
    }
    return false;
  };
  const tickOne = (state: (typeof states)[number], dt: number) => {
    const before = state.movement.route.length;
    if (state.phase === 'traveling') {
      advanceMovement(state.movement, dt, SPEED);
      if (!state.movement.route.length && state.destination) { state.settlement = byId.get(state.destination)!; state.current = state.destination; state.destination = null; state.phase = 'roaming'; state.visit = randomRange(state.random, 40, 60); state.pause = 0; state.target = null; }
      return;
    }
    state.visit -= dt;
    if (state.phase === 'roaming' && state.visit <= 0) {
      state.phase = 'returning';
      state.target = null;
      state.finishingRoamStep = state.movement.route.length > 0;
      if (!state.finishingRoamStep) {
        state.movement.route = path(reader, state.movement.tile, { col: state.settlement.col, row: state.settlement.row }, (p) => reader.getTile(p)?.walkable === true, state.settlement.bounds) ?? [];
        state.movement.destination = { col: state.settlement.col, row: state.settlement.row };
      }
    }
    if (state.phase === 'returning') {
      advanceMovement(state.movement, dt, SPEED);
      if (state.finishingRoamStep && !state.movement.route.length) {
        state.finishingRoamStep = false;
        state.movement.route = path(reader, state.movement.tile, { col: state.settlement.col, row: state.settlement.row }, (p) => reader.getTile(p)?.walkable === true, state.settlement.bounds) ?? [];
        state.movement.destination = { col: state.settlement.col, row: state.settlement.row };
        return;
      }
      if (!state.movement.route.length) { state.visit = randomRange(state.random, 40, 60); state.phase = 'roaming'; chooseTravel(state); }
      return;
    }
    if (state.pause > 0) { state.pause = Math.max(0, state.pause - dt); return; }
    if (!state.movement.route.length) {
      const candidates = local(state.settlement).filter((p) => key(p) !== key(state.movement.tile));
      state.target = candidates.length ? candidates[Math.floor(state.random() * candidates.length)]! : null;
      if (state.target) state.movement.route = path(reader, state.movement.tile, state.target, (p) => reader.getTile(p)?.walkable === true, state.settlement.bounds) ?? [];
      state.movement.destination = state.target;
      if (!state.movement.route.length) state.pause = randomRange(state.random, 1, 3);
    }
    advanceMovement(state.movement, dt, SPEED);
    if (before > 0 && !state.movement.route.length) state.pause = randomRange(state.random, 1, 3);
  };
  let accumulator = 0;
  const tick = (delta: number) => { accumulator += Math.min(Math.max(0, delta), 0.1); while (accumulator >= 1 / 60) { for (const state of states) tickOne(state, 1 / 60); accumulator -= 1 / 60; } };
  const snapshots = () => states.map((s): AdventurerSnapshot => ({ id: s.id, position: { ...s.movement.position }, tile: { ...s.movement.tile }, facing: s.movement.facing, walking: s.movement.route.length > 0, phase: s.phase, currentSettlementId: s.current, previousSettlementId: s.previous, destinationSettlementId: s.destination }));
  const step = (delta: number) => { for (const state of states) tickOne(state, delta); };
  return { tick, step, snapshots };
}

export type AdventurerSimulation = ReturnType<typeof createAdventurerSimulation>;
