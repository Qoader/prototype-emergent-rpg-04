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
import { fortificationOrientation, fortificationPalette } from './tileIllustration';
export type GameMode = 'exploration' | 'battle' | 'result';
export type Encounter = { goblinId: string; tile: Point };
export type SessionState =
  | { kind: 'exploration' }
  | { kind: 'battle'; encounter: Encounter; battle: BattleState }
  | { kind: 'result'; encounter: Encounter; battle: BattleState };
export type PointerInput = { clientX:number; clientY:number; pointerType:string; button:number; rect:{left:number;top:number}; camera:{x:number;y:number} };
export type GameSnapshot = { mode: GameMode; battle: BattleState | null; battleBusy: boolean };
export function createGameController(map: WorldMap, tiles?: TileReader) {
  const movement = createMovement(map.spawn); const reader = tiles ?? { width: map.width, height: map.height, getTile: (point: Point) => tileAt(map, point) };
  const adventurers = createAdventurerSimulation(map, reader); const goblins = createGoblinSimulation({ seed: map.seed, nests: map.goblinNests ?? [], tiles: reader, settlements: map.settlements });
  let session: SessionState = { kind: 'exploration' }; let aiWait = 0; let battlePlayback: ReturnType<typeof createMovement> | undefined; let battlePlaybackActor = 'player'; let battlePlaybackElapsed = 0; const listeners = new Set<(snapshot: GameSnapshot) => void>(); const checkpoints = createCheckpointTracker(map.spawn, map.settlements ?? [], reader);
  const snapshot = (): GameSnapshot => { if (session.kind === 'exploration') return { mode: session.kind, battle: null, battleBusy: false }; const battle = structuredClone(session.battle); if (battlePlayback) battle.visual = { [battlePlaybackActor]: { x: battlePlayback.position.x, y: battlePlayback.position.y, facing: battlePlayback.facing, moving: battlePlayback.route.length > 0, elapsed: battlePlaybackElapsed } }; return { mode: session.kind, battle, battleBusy: Boolean(battlePlayback) }; }; const notify = () => { const value = snapshot(); listeners.forEach((listener) => listener(value)); };
  const relocate = (point: Point) => { movement.tile = { ...point }; movement.position = { x: point.col + .5, y: point.row + .5 }; movement.route = []; movement.destination = null; };
  const beginBattle = (id: string) => { if (session.kind !== 'exploration') return; movement.route = []; movement.destination = null; relocate(movement.tile); const contact = { ...movement.tile }; const source = reader.getTile(contact); const route = (p: Point) => { const kind = reader.getTile(p)?.kind; return kind === 'road' || kind === 'bridge' || kind === 'gate'; }; const scene = source ? { appearance: { tile: structuredClone(source), seed: Math.abs((contact.col * 13 + contact.row * 7) % 11), connections: { north: route({ col: contact.col, row: contact.row - 1 }), east: route({ col: contact.col + 1, row: contact.row }), south: route({ col: contact.col, row: contact.row + 1 }), west: route({ col: contact.col - 1, row: contact.row }) }, fortificationOrientation: fortificationOrientation(source, map), palette: fortificationPalette(source, map) } } : undefined; session = { kind:'battle', encounter:{ goblinId:id, tile:contact }, battle:createBattle(id, scene) }; aiWait = 0; notify(); };
  const checkContact = () => { const id = findGoblinContact(movement.tile, goblins.snapshots()); if (id) beginBattle(id); };
  const requestDestination = (requested: Point) => { if (session.kind !== 'exploration') return null; const plan = planNavigation(reader, movement.tile, requested); if (!plan) return null; movement.route = plan.route; movement.destination = plan.destination; return plan.destination; };
  const pointerDown = (input: PointerInput) => acceptsPointer(input.pointerType, input.button) ? requestDestination(tilePointFromPointer(input)) : null;
  // Resolve a terminal battle as part of the same synchronous transition as
  // the command. The caller publishes one committed snapshot afterwards.
  const finish = () => { if (session.kind !== 'battle' || !session.battle.outcome) return false; const { encounter, battle: finished } = session; if (finished.outcome === 'victory') goblins.remove(encounter.goblinId); if (finished.outcome === 'defeat') relocate(checkpoints.resolve()); session = { kind:'result', encounter, battle:finished }; aiWait = 0; return true; };
  const apply = (command: BattleCommand) => { if (session.kind !== 'battle' || battlePlayback) return false; const transition = applyBattleCommand(session.battle, command); if ('error' in transition) return false; session = { ...session, battle:transition.state }; const move = transition.events.find((event): event is Extract<typeof event, { kind: 'move' }> => event.kind === 'move'); if (move) { battlePlaybackActor = move.actorId; battlePlaybackElapsed = 0; battlePlayback = createMovement(move.from); battlePlayback.route = move.path.slice(1).map((point) => ({ ...point })); battlePlayback.destination = { ...move.to }; } finish(); if (session.kind === 'battle' && session.battle.activeId !== 'player') aiWait = 0; notify(); return true; };
  const tick = (deltaSeconds: number) => {
    const elapsed = Math.max(0, deltaSeconds);
    if (session.kind !== 'exploration') {
      if (battlePlayback) {
        battlePlaybackElapsed += elapsed; advanceMovement(battlePlayback, elapsed, 6);
        if (!battlePlayback.route.length) battlePlayback = undefined;
        notify();
        return;
      }
      if (session.kind === 'battle' && session.battle.activeId !== 'player' && !session.battle.outcome) {
        aiWait += elapsed;
        if (aiWait >= .25) { aiWait = 0; apply(chooseGoblinCommand(session.battle)); }
      }
      return;
    }
    checkContact(); if (session.kind !== 'exploration') return;
    if (!elapsed) { advanceMovement(movement, 0); return; }
    let remaining = elapsed; const step = 1 / 60;
    while (remaining > 0 && session.kind === 'exploration') {
      const dt = Math.min(step, remaining); advanceMovement(movement, dt); checkpoints.visit(movement.tile); checkContact();
      if (session.kind !== 'exploration') break;
      adventurers.step(dt); const targets = [{ id:'player', kind:'player' as const, tile:movement.tile, position:{...movement.position} }, ...adventurers.snapshots().map((npc) => ({ id:npc.id, kind:'adventurer' as const, tile:npc.tile, position:npc.position }))]; goblins.step(dt, targets); checkContact(); remaining -= dt;
    }
  };
  const continueFromResult = () => { if (session.kind !== 'result') return; session = { kind:'exploration' }; notify(); };
  const subscribe = (listener: (snapshot: GameSnapshot) => void) => { listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener); };
  return { movement, pointerDown, requestDestination, tick, adventurers, goblins, checkpoints, startBattleForTest: beginBattle, get mode(){return session.kind;}, get battle(){return session.kind === 'exploration' ? null : session.battle;}, dispatchBattle: apply, continueFromResult, subscribe, getSnapshot:snapshot };
}
export type GameController = ReturnType<typeof createGameController>;
