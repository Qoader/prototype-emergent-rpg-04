import { planNavigation } from './pathfinding';
import { advanceMovement, createMovement } from './movement';
import type { Point, TileReader, WorldMap } from './types';
import { acceptsPointer, tilePointFromPointer } from './input';
import { createAdventurerSimulation } from './adventurers';
import { tileAt } from './map';
import { createGoblinSimulation, type GoblinTarget } from './goblins';
import { applyBattleCommand, createBattle } from './battle/engine';
import { runGoblinTurn } from './battle/ai';
import type { BattleCommand, BattleState } from './battle/types';

export type GameMode = 'exploration' | 'battle' | 'result';

export type PointerInput = {
  clientX: number;
  clientY: number;
  pointerType: string;
  button: number;
  rect: { left: number; top: number };
  camera: { x: number; y: number };
};

/** Gameplay state boundary used by the renderer and by integration tests. */
export function createGameController(map: WorldMap, tiles?: TileReader) {
  const movement = createMovement(map.spawn);
  const reader = tiles ?? { width: map.width, height: map.height, getTile: (point: Point) => tileAt(map, point) };
  const adventurers = createAdventurerSimulation(map, reader);
  const goblins = createGoblinSimulation({ seed: map.seed, nests: map.goblinNests ?? [], tiles: reader, settlements: map.settlements });
  let mode: GameMode = 'exploration';
  let battle: BattleState | null = null;
  let encounterGoblinId: string | null = null;
  let respawn = { ...map.spawn };
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const settlementAt = (p: Point) => (map.settlements ?? []).find((s) => p.col >= s.bounds.left && p.col <= s.bounds.right && p.row >= s.bounds.top && p.row <= s.bounds.bottom);
  const updateCheckpoint = () => { if (settlementAt(movement.tile)) respawn = { ...movement.tile }; };
  const beginBattle = (id: string) => { if (mode !== 'exploration') return; encounterGoblinId = id; movement.route = []; movement.destination = null; movement.position = { x: movement.tile.col + 0.5, y: movement.tile.row + 0.5 }; battle = createBattle(id); mode = 'battle'; notify(); };
  const checkContact = () => { const match = goblins.snapshots().filter((g) => g.tile.col === movement.tile.col && g.tile.row === movement.tile.row).sort((a, b) => a.id.localeCompare(b.id))[0]; if (match) beginBattle(match.id); };

  const requestDestination = (requested: Point) => {
    if (mode !== 'exploration') return null;
    const plan = planNavigation(tiles ?? map, movement.tile, requested);
    if (!plan) return null;
    movement.route = plan.route;
    movement.destination = plan.destination;
    return plan.destination;
  };

  const pointerDown = (input: PointerInput) => {
    if (!acceptsPointer(input.pointerType, input.button)) return null;
    return requestDestination(tilePointFromPointer(input));
  };

  const tick = (deltaSeconds: number) => {
    if (mode !== 'exploration') return;
    const elapsed = Math.max(0, deltaSeconds);
    // Preserve the movement contract used by callers that flush an already
    // completed route with a zero-duration tick.
    if (elapsed === 0) {
      advanceMovement(movement, 0);
      return;
    }
    checkContact();
    if (mode !== 'exploration') return;
    advanceMovement(movement, elapsed);
    updateCheckpoint();
    checkContact();
    if (mode !== 'exploration') return;
    adventurers.tick(elapsed);
    const targets: GoblinTarget[] = [{ id: 'player', kind: 'player', tile: movement.tile, position: { ...movement.position } }, ...adventurers.snapshots().map((npc) => ({ id: npc.id, kind: 'adventurer' as const, tile: npc.tile, position: npc.position }))];
    goblins.tick(elapsed, targets);
    checkContact();
  };
  const dispatchBattle = (command: BattleCommand) => { if (!battle || mode !== 'battle') return false; const transition = applyBattleCommand(battle, command); if ('error' in transition) return false; battle = transition.state; if (battle.outcome) { if (battle.outcome === 'victory' && encounterGoblinId) goblins.remove(encounterGoblinId); if (battle.outcome === 'defeat') { movement.tile = { ...respawn }; movement.position = { x: respawn.col + 0.5, y: respawn.row + 0.5 }; movement.route = []; movement.destination = null; } mode = 'result'; } else if (battle.activeId !== 'player') battle = runGoblinTurn(battle); if (battle.outcome) { if (battle.outcome === 'defeat') { movement.tile = { ...respawn }; movement.position = { x: respawn.col + 0.5, y: respawn.row + 0.5 }; movement.route = []; movement.destination = null; } mode = 'result'; } notify(); return true; };
  const continueFromResult = () => { if (mode !== 'result') return; mode = 'exploration'; battle = null; encounterGoblinId = null; notify(); };
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };
  return { movement, pointerDown, requestDestination, tick, adventurers, goblins, get mode() { return mode; }, get battle() { return battle; }, dispatchBattle, continueFromResult, subscribe };
}

export type GameController = ReturnType<typeof createGameController>;
