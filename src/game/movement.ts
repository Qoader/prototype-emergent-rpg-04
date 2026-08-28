import type { Point } from './types';
export const TILES_PER_SECOND = 6;
export type Facing = 'north' | 'south' | 'east' | 'west';
export type Movement = { position: { x: number; y: number }; tile: Point; route: Point[]; destination: Point | null; facing: Facing };
export function createMovement(tile: Point): Movement { return { position: { x: tile.col + 0.5, y: tile.row + 0.5 }, tile, route: [], destination: null, facing: 'south' }; }
function facingFor(from: Point, to: Point): Facing { if (to.col !== from.col) return to.col > from.col ? 'east' : 'west'; return to.row > from.row ? 'south' : 'north'; }
export function advanceMovement(state: Movement, deltaSeconds: number): Movement { let remaining = Math.max(0, deltaSeconds) * TILES_PER_SECOND; while (remaining > 0 && state.route.length) { const next = state.route[0]; state.facing = facingFor(state.tile, next); const target = { x: next.col + 0.5, y: next.row + 0.5 }; const dx = target.x - state.position.x; const dy = target.y - state.position.y; const distance = Math.hypot(dx, dy); if (distance <= remaining) { state.position = target; state.tile = next; state.route.shift(); remaining -= distance; } else { state.position = { x: state.position.x + (dx / distance) * remaining, y: state.position.y + (dy / distance) * remaining }; remaining = 0; } } if (!state.route.length) state.destination = null; return state; }
