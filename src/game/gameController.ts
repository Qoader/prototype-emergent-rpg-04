import { planNavigation } from './pathfinding';
import { advanceMovement, createMovement } from './movement';
import type { Point, TileReader, WorldMap } from './types';
import { acceptsPointer, tilePointFromPointer } from './input';
import { createAdventurerSimulation } from './adventurers';
import { tileAt } from './map';
import { createGoblinSimulation } from './goblins';
import { advanceTurn, applyBattleCommand, createBattle } from './battle/engine';
import { chooseGoblinCommand } from './battle/ai';
import { admitReinforcements, type BattleArrival } from './battle/reinforcements';
import type { BattleCommand, BattleState, BattleNotice } from './battle/types';
import { initialBattleNotice, reduceBattleNotice } from './battle/notice';
import { findGoblinContact } from './encounters';
import { createCheckpointTracker } from './checkpoints';
import { fortificationOrientation, fortificationPalette } from './tileIllustration';
export type GameMode = 'exploration' | 'battle' | 'result';
export type Encounter = { goblinId: string; tile: Point };
export type SessionState =
  | { kind: 'exploration' }
  | { kind: 'battle'; encounter: Encounter; battle: BattleState }
  | { kind: 'result'; encounter: Encounter; battle: BattleState };
export type PointerInput = {
  clientX: number;
  clientY: number;
  pointerType: string;
  button: number;
  rect: { left: number; top: number };
  camera: { x: number; y: number };
};
export type GameSnapshot = {
  mode: GameMode;
  battle: BattleState | null;
  battleBusy: boolean;
  battleNotice: BattleNotice | null;
};
export const ENEMY_ACTION_DELAY_SECONDS = 0.9;
export function createGameController(map: WorldMap, tiles?: TileReader) {
  const movement = createMovement(map.spawn);
  const reader = tiles ?? {
    width: map.width,
    height: map.height,
    getTile: (point: Point) => tileAt(map, point)
  };
  const adventurers = createAdventurerSimulation(map, reader);
  const goblins = createGoblinSimulation({
    seed: map.seed,
    nests: map.goblinNests ?? [],
    tiles: reader,
    settlements: map.settlements
  });
  let session: SessionState = { kind: 'exploration' };
  let battleNotice: BattleNotice | null = null;
  let aiWait = 0;
  let battlePlayback: ReturnType<typeof createMovement> | undefined;
  let battlePlaybackActor = 'player';
  let battlePlaybackElapsed = 0;
  let reinforcementStep = 0;
  let waitingReinforcements: BattleArrival[] = [];
  const listeners = new Set<(snapshot: GameSnapshot) => void>();
  const checkpoints = createCheckpointTracker(map.spawn, map.settlements ?? [], reader);
  const snapshot = (): GameSnapshot => {
    if (session.kind === 'exploration')
      return { mode: session.kind, battle: null, battleBusy: false, battleNotice: null };
    const battle = structuredClone(session.battle);
    if (battlePlayback)
      battle.visual = {
        [battlePlaybackActor]: {
          x: battlePlayback.position.x,
          y: battlePlayback.position.y,
          facing: battlePlayback.facing,
          moving: battlePlayback.route.length > 0,
          elapsed: battlePlaybackElapsed
        }
      };
    return { mode: session.kind, battle, battleBusy: Boolean(battlePlayback), battleNotice };
  };
  const notify = () => {
    const value = snapshot();
    listeners.forEach((listener) => listener(value));
  };
  const relocate = (point: Point) => {
    movement.tile = { ...point };
    movement.position = { x: point.col + 0.5, y: point.row + 0.5 };
    movement.route = [];
    movement.destination = null;
  };
  const beginBattle = (id: string) => {
    if (session.kind !== 'exploration') return;
    movement.route = [];
    movement.destination = null;
    relocate(movement.tile);
    const contact = { ...movement.tile };
    const source = reader.getTile(contact);
    const route = (p: Point) => {
      const kind = reader.getTile(p)?.kind;
      return kind === 'road' || kind === 'bridge' || kind === 'gate';
    };
    const scene = source
      ? {
          appearance: {
            tile: structuredClone(source),
            seed: Math.abs((contact.col * 13 + contact.row * 7) % 11),
            connections: {
              north: route({ col: contact.col, row: contact.row - 1 }),
              east: route({ col: contact.col + 1, row: contact.row }),
              south: route({ col: contact.col, row: contact.row + 1 }),
              west: route({ col: contact.col - 1, row: contact.row })
            },
            fortificationOrientation: fortificationOrientation(source, map),
            palette: fortificationPalette(source, map)
          }
        }
      : undefined;
    session = {
      kind: 'battle',
      encounter: { goblinId: id, tile: contact },
      battle: createBattle(id, scene)
    };
    battleNotice = initialBattleNotice();
    reinforcementStep = 0;
    waitingReinforcements = [];
    // NPCs perceive the fixed encounter tile and retain that commitment.
    if (!map.disableBattleResponses) {
      adventurers.respondToBattle(contact, contact);
      goblins.respondToBattle(contact, contact);
    }
    goblins.setParticipant(id, true);
    aiWait = 0;
    notify();
  };
  const checkContact = () => {
    const id = findGoblinContact(movement.tile, goblins.snapshots());
    if (id) beginBattle(id);
  };
  const requestDestination = (requested: Point) => {
    if (session.kind !== 'exploration') return null;
    const plan = planNavigation(reader, movement.tile, requested);
    if (!plan) return null;
    movement.route = plan.route;
    movement.destination = plan.destination;
    return plan.destination;
  };
  const pointerDown = (input: PointerInput) =>
    acceptsPointer(input.pointerType, input.button)
      ? requestDestination(tilePointFromPointer(input))
      : null;
  // Resolve a terminal battle as part of the same synchronous transition as
  // the command. The caller publishes one committed snapshot afterwards.
  const finish = () => {
    if (session.kind !== 'battle' || !session.battle.outcome) return false;
    const { encounter, battle: finished } = session;
    for (const combatant of Object.values(finished.combatants)) {
      if (combatant.hp > 0) continue;
      if (combatant.kind === 'goblin') goblins.remove(combatant.id);
      if (combatant.kind === 'adventurer') adventurers.remove(combatant.id);
    }
    if (map.removeGoblinsAfterBattle) goblins.removeAll();
    adventurers.clearBattleResponses();
    goblins.clearBattleResponses();
    if (finished.outcome === 'defeat') relocate(checkpoints.resolve());
    // The terminal action is still a completed turn. Advance ordinary NPC
    // life, while deliberately suppressing a new encounter until Continue.
    for (let step = 0; step < 180; step += 1) {
      adventurers.step(1 / 60);
      goblins.step(1 / 60, [{ id: 'player', kind: 'player', tile: movement.tile, position: { ...movement.position } }]);
    }
    session = { kind: 'result', encounter, battle: finished };
    aiWait = 0;
    return true;
  };
  /** Advances exactly three simulated seconds at every completed turn. */
  const advanceBattleWorld = () => {
    if (session.kind !== 'battle') return;
    const encounter = session.encounter;
    const joined = new Set(Object.keys(session.battle.combatants));
    for (let index = 0; index < 180; index += 1) {
      reinforcementStep += 1;
      // Newly-visible NPCs commit during this interval; committed ones never
      // depend on the radius check again.
      if (!map.disableBattleResponses) {
        adventurers.respondToBattle(encounter.tile, encounter.tile);
        goblins.respondToBattle(encounter.tile, encounter.tile);
      }
      adventurers.step(1 / 60);
      const targets = [{ id: 'player', kind: 'player' as const, tile: movement.tile, position: { ...movement.position } }];
      goblins.step(1 / 60, targets);
      for (const response of adventurers.battleResponses())
        if (response.arrived && !joined.has(response.id) && !waitingReinforcements.some((x) => x.id === response.id))
          waitingReinforcements.push({ ...response, kind: 'adventurer', arrivalStep: reinforcementStep });
      for (const response of goblins.battleResponses())
        if (response.arrived && !joined.has(response.id) && response.id !== encounter.goblinId && !waitingReinforcements.some((x) => x.id === response.id))
          waitingReinforcements.push({ ...response, kind: 'goblin', arrivalStep: reinforcementStep });
    }
    const events: import('./battle/types').BattleEvent[] = [];
    waitingReinforcements = admitReinforcements(session.battle, waitingReinforcements, events);
    for (const event of events) {
      if (event.kind !== 'combatant-joined') continue;
      if (session.battle.combatants[event.actorId]?.kind === 'goblin') goblins.setParticipant(event.actorId, true);
      else adventurers.setParticipant(event.actorId, true);
    }
    advanceTurn(session.battle, events);
    session.battle.log = [...session.battle.log, ...events].slice(-50);
    battleNotice = reduceBattleNotice(battleNotice ?? initialBattleNotice(), events);
  };
  const apply = (command: BattleCommand) => {
    if (session.kind !== 'battle' || battlePlayback) return false;
    const transition = applyBattleCommand(session.battle, command, { deferTurn: true });
    if ('error' in transition) return false;
    battleNotice = reduceBattleNotice(battleNotice ?? initialBattleNotice(), transition.events);
    session = { ...session, battle: transition.state };
    const move = transition.events.find(
      (event): event is Extract<typeof event, { kind: 'move' }> => event.kind === 'move'
    );
    if (move) {
      battlePlaybackActor = move.actorId;
      battlePlaybackElapsed = 0;
      battlePlayback = createMovement(move.from);
      battlePlayback.route = move.path.slice(1).map((point) => ({ ...point }));
      battlePlayback.destination = { ...move.to };
    }
    const ended = transition.events.some((event) => event.kind === 'turn-ended');
    if (session.kind === 'battle' && session.battle.outcome) finish();
    else if (session.kind === 'battle' && ended) advanceBattleWorld();
    if (session.kind === 'battle' && session.battle.combatants[session.battle.activeId]?.control === 'ai') aiWait = 0;
    notify();
    return true;
  };
  const tick = (deltaSeconds: number) => {
    const elapsed = Math.max(0, deltaSeconds);
    if (session.kind !== 'exploration') {
      if (battlePlayback) {
        battlePlaybackElapsed += elapsed;
        advanceMovement(battlePlayback, elapsed, 6);
        if (!battlePlayback.route.length) battlePlayback = undefined;
        notify();
        return;
      }
      if (
        session.kind === 'battle' &&
        session.battle.combatants[session.battle.activeId]?.control === 'ai' &&
        !session.battle.outcome
      ) {
        aiWait += elapsed;
        if (aiWait >= ENEMY_ACTION_DELAY_SECONDS) {
          aiWait = 0;
          apply(chooseGoblinCommand(session.battle));
        }
      }
      return;
    }
    checkContact();
    if (session.kind !== 'exploration') return;
    if (!elapsed) {
      advanceMovement(movement, 0);
      return;
    }
    let remaining = elapsed;
    const step = 1 / 60;
    while (remaining > 0 && session.kind === 'exploration') {
      const dt = Math.min(step, remaining);
      advanceMovement(movement, dt);
      checkpoints.visit(movement.tile);
      checkContact();
      if (session.kind !== 'exploration') break;
      adventurers.step(dt);
      const targets = [
        {
          id: 'player',
          kind: 'player' as const,
          tile: movement.tile,
          position: { ...movement.position }
        },
        ...adventurers
          .snapshots()
          .map((npc) => ({
            id: npc.id,
            kind: 'adventurer' as const,
            tile: npc.tile,
            position: npc.position
          }))
      ];
      goblins.step(dt, targets);
      checkContact();
      remaining -= dt;
    }
  };
  const continueFromResult = () => {
    if (session.kind !== 'result') return;
    session = { kind: 'exploration' };
    notify();
  };
  const subscribe = (listener: (snapshot: GameSnapshot) => void) => {
    listeners.add(listener);
    listener(snapshot());
    return () => listeners.delete(listener);
  };
  return {
    movement,
    pointerDown,
    requestDestination,
    tick,
    adventurers,
    goblins,
    checkpoints,
    startBattleForTest: beginBattle,
    get mode() {
      return session.kind;
    },
    get battle() {
      return session.kind === 'exploration' ? null : session.battle;
    },
    dispatchBattle: apply,
    continueFromResult,
    subscribe,
    getSnapshot: snapshot
  };
}
export type GameController = ReturnType<typeof createGameController>;
