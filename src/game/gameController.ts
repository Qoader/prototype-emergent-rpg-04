import { planNavigation } from './pathfinding';
import { advanceMovement, createMovement } from './movement';
import type { Point, TileReader, WorldMap } from './types';
import { acceptsPointer, tilePointFromPointer } from './input';
import { createAdventurerSimulation } from './adventurers';
import { tileAt } from './map';
import { createGoblinSimulation } from './goblins';
import { applyBattleCommand, createBattle } from './battle/engine';
import { chooseGoblinCommand } from './battle/ai';
import type { BattleCommand, BattleState } from './battle/types';
import { findGoblinContact } from './encounters';
import { createCheckpointTracker } from './checkpoints';
export type GameMode = 'exploration' | 'battle' | 'result';
export type Encounter = { goblinId: string; tile: Point };
export type SessionState =
  | { kind: 'exploration' }
  | { kind: 'battle'; encounter: Encounter; battle: BattleState }
  | { kind: 'result'; encounter: Encounter; battle: BattleState };
export type PointerInput = { clientX:number; clientY:number; pointerType:string; button:number; rect:{left:number;top:number}; camera:{x:number;y:number} };
export type GameSnapshot = { mode: GameMode; battle: BattleState | null };
export function createGameController(map: WorldMap, tiles?: TileReader) {
  const movement = createMovement(map.spawn); const reader = tiles ?? { width: map.width, height: map.height, getTile: (point: Point) => tileAt(map, point) };
  const adventurers = createAdventurerSimulation(map, reader); const goblins = createGoblinSimulation({ seed: map.seed, nests: map.goblinNests ?? [], tiles: reader, settlements: map.settlements });
  let session: SessionState = { kind: 'exploration' }; let aiWait = 0; const listeners = new Set<(snapshot: GameSnapshot) => void>(); const checkpoints = createCheckpointTracker(map.spawn, map.settlements ?? [], reader);
  const snapshot = (): GameSnapshot => ({ mode: session.kind, battle: session.kind === 'exploration' ? null : structuredClone(session.battle) }); const notify = () => { const value = snapshot(); listeners.forEach((listener) => listener(value)); };
  const relocate = (point: Point) => { movement.tile = { ...point }; movement.position = { x: point.col + .5, y: point.row + .5 }; movement.route = []; movement.destination = null; };
  const beginBattle = (id: string) => { if (session.kind !== 'exploration') return; movement.route = []; movement.destination = null; relocate(movement.tile); session = { kind:'battle', encounter:{ goblinId:id, tile:{...movement.tile} }, battle:createBattle(id) }; aiWait = 0; notify(); };
  const checkContact = () => { const id = findGoblinContact(movement.tile, goblins.snapshots()); if (id) beginBattle(id); };
  const requestDestination = (requested: Point) => { if (session.kind !== 'exploration') return null; const plan = planNavigation(reader, movement.tile, requested); if (!plan) return null; movement.route = plan.route; movement.destination = plan.destination; return plan.destination; };
  const pointerDown = (input: PointerInput) => acceptsPointer(input.pointerType, input.button) ? requestDestination(tilePointFromPointer(input)) : null;
  // Resolve a terminal battle as part of the same synchronous transition as
  // the command. The caller publishes one committed snapshot afterwards.
  const finish = () => { if (session.kind !== 'battle' || !session.battle.outcome) return false; const { encounter, battle: finished } = session; if (finished.outcome === 'victory') goblins.remove(encounter.goblinId); if (finished.outcome === 'defeat') relocate(checkpoints.resolve()); session = { kind:'result', encounter, battle:finished }; aiWait = 0; return true; };
  const apply = (command: BattleCommand) => { if (session.kind !== 'battle') return false; const transition = applyBattleCommand(session.battle, command); if ('error' in transition) return false; session = { ...session, battle:transition.state }; finish(); if (session.kind === 'battle' && session.battle.activeId !== 'player') aiWait = 0; notify(); return true; };
  const tick = (deltaSeconds: number) => { const elapsed = Math.max(0, deltaSeconds); if (session.kind !== 'exploration') { if (session.kind === 'battle' && session.battle.activeId !== 'player' && !session.battle.outcome) { aiWait += elapsed; if (aiWait >= .25) { aiWait = 0; apply(chooseGoblinCommand(session.battle)); } } return; } checkContact(); if (session.kind !== 'exploration') return; if (!elapsed) { advanceMovement(movement, 0); return; } let remaining = elapsed; const step = 1 / 60; while (remaining > 0 && session.kind === 'exploration') { const dt = Math.min(step, remaining); advanceMovement(movement, dt); checkpoints.visit(movement.tile); checkContact(); if (session.kind !== 'exploration') break; adventurers.step(dt); const targets = [{ id:'player', kind:'player' as const, tile:movement.tile, position:{...movement.position} }, ...adventurers.snapshots().map((npc) => ({ id:npc.id, kind:'adventurer' as const, tile:npc.tile, position:npc.position }))]; goblins.step(dt, targets); checkContact(); remaining -= dt; } };
  const continueFromResult = () => { if (session.kind !== 'result') return; session = { kind:'exploration' }; notify(); };
  const subscribe = (listener: (snapshot: GameSnapshot) => void) => { listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener); };
  return { movement, pointerDown, requestDestination, tick, adventurers, goblins, checkpoints, startBattleForTest: beginBattle, get mode(){return session.kind;}, get battle(){return session.kind === 'exploration' ? null : session.battle;}, dispatchBattle: apply, continueFromResult, subscribe, getSnapshot:snapshot };
}
export type GameController = ReturnType<typeof createGameController>;
