import { planNavigation } from './pathfinding';
import { advanceMovement, createMovement, TILES_PER_SECOND } from './movement';
import type { Point, TileReader, WorldMap } from './types';
import { acceptsPointer, tilePointFromPointer } from './input';
import { createAdventurerSimulation } from './adventurers';
import { tileAt } from './map';
import { createGoblinSimulation } from './goblins';
import {
  advanceTurn,
  applyBattleCommand,
  createBattle,
  evaluateBattleOutcome
} from './battle/engine';
import { chooseGoblinCommand } from './battle/ai';
import { admitReinforcements } from './battle/reinforcements';
import { createCombatant } from './battle/rules';
import type {
  BattleCommand,
  BattleState,
  BattleNotice,
  BattleEvent,
  BattleTransition
} from './battle/types';
import { initialBattleNotice, reduceBattleNotice } from './battle/notice';
import { createCheckpointTracker } from './checkpoints';
import { fortificationOrientation, fortificationPalette } from './tileIllustration';
import {
  createWorldBattleRegistry,
  type BattleId,
  type BattleSummary,
  type WorldBattle
} from './worldBattles';
import { advanceRouteField, createRouteField, routeKey, type RouteField } from './battleRoutes';
import { createInventoryService } from './inventory/store';
import { deterministicLoot } from './inventory/loot';
import type { ItemId, InventorySnapshot } from './inventory/types';
import {
  advanceSearch,
  noInteraction,
  openTileActions,
  startSearch,
  type InteractionState,
  type RandomSource
} from './interactions';
import { createSearchKnowledge } from './searchKnowledge';
import { tileCenterInViewport, type WorldViewport } from './worldObservation';

export type GameMode = 'exploration' | 'battle' | 'result';
export type Encounter = { goblinId: string; tile: Point };
type SessionState =
  | { kind: 'exploration' }
  | { kind: 'battle'; battleId: BattleId }
  | { kind: 'result'; battle: BattleState };
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
  battles: BattleSummary[];
  selectedBattleId: BattleId | null;
  playerEntry: 'waiting' | 'admitted' | null;
  inventory: InventorySnapshot;
  interaction: InteractionState;
  /** Tiles where the player knows a search may be worthwhile. */
  searchCueTiles: Point[];
  searchCueRevision: number;
};
export const ENEMY_ACTION_DELAY_SECONDS = 0.9;
const STEP = 1 / 60;
const tileEqual = (a: Point, b: Point) => a.col === b.col && a.row === b.row;

export function createGameController(
  map: WorldMap,
  tiles?: TileReader,
  options: { random?: RandomSource } = {}
) {
  const random = options.random ?? Math.random;
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
  const registry = createWorldBattleRegistry();
  const inventoryService = createInventoryService();
  const searchKnowledge = createSearchKnowledge();
  let worldViewport: WorldViewport | null = null;
  const playerInventory = inventoryService.register('player', 30000, [
    { id: 'ration', quantity: 4 },
    { id: 'bandage', quantity: 3 },
    { id: 'rope', quantity: 1 }
  ]);
  for (const actor of adventurers.snapshots())
    inventoryService.register(actor.id, 25000, [
      { id: 'ration', quantity: 3 },
      { id: 'bandage', quantity: 2 },
      { id: 'rope', quantity: 1 }
    ]);
  for (const actor of goblins.snapshots())
    inventoryService.register(actor.id, 15000, [
      { id: 'ration', quantity: 1 },
      { id: 'stone', quantity: 3 }
    ]);
  let inventoryPause = false;
  let inventorySessionOpen = false;
  let interaction: InteractionState = noInteraction();
  const closeInteraction = () => {
    interaction = noInteraction();
  };
  const closeInventorySession = () => {
    inventoryPause = false;
    inventorySessionOpen = false;
  };
  const checkpoints = createCheckpointTracker(map.spawn, map.settlements ?? [], reader);
  const listeners = new Set<(snapshot: GameSnapshot) => void>();
  let session: SessionState = { kind: 'exploration' };
  let battleNotice: BattleNotice | null = null;
  let battlePlayback: ReturnType<typeof createMovement> | undefined;
  let battlePlaybackActor = 'player';
  let battlePlaybackBattleId: BattleId | undefined;
  let battlePlaybackElapsed = 0;
  // A command can spend the last available action at the same time as it
  // moves.  Its rules state is committed immediately, but the next turn must
  // wait until the visible route has finished.
  let pendingBoundary: { battleId: BattleId; advanceWorld: boolean } | undefined;
  let worldStep = 0;
  const routeFields = new Map<BattleId, RouteField>();
  const newField = (tile: Point): RouteField => createRouteField(tile);
  const fieldFor = (battle: WorldBattle) => {
    let field = routeFields.get(battle.id);
    if (!field) {
      field = newField(battle.tile);
      routeFields.set(battle.id, field);
    }
    return field;
  };
  const advanceFields = () => {
    let budget = 512;
    for (const battle of registry.all().sort((a, b) => a.id.localeCompare(b.id))) {
      const field = fieldFor(battle);
      budget -= advanceRouteField(field, reader, budget);
      if (!budget) break;
    }
  };
  const selected = () => (session.kind === 'battle' ? registry.get(session.battleId) : undefined);
  const sceneAt = (contact: Point): BattleState['scene'] | undefined => {
    const source = reader.getTile(contact);
    if (!source) return undefined;
    const route = (p: Point) => ['road', 'bridge', 'gate'].includes(reader.getTile(p)?.kind ?? '');
    return {
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
    };
  };
  const snapshot = (): GameSnapshot => {
    const active = selected();
    const battle = active
      ? structuredClone(active.battle)
      : session.kind === 'result'
        ? structuredClone(session.battle)
        : null;
    if (battle && battlePlayback && active?.id === battlePlaybackBattleId)
      battle.visual = {
        [battlePlaybackActor]: {
          x: battlePlayback.position.x,
          y: battlePlayback.position.y,
          facing: battlePlayback.facing,
          moving: battlePlayback.route.length > 0,
          elapsed: battlePlaybackElapsed
        }
      };
    const member = registry.membership('player');
    const playerEntry =
      member && member.battleId === active?.id
        ? member.stage === 'participating'
          ? 'admitted'
          : 'waiting'
        : null;
    const cues = searchKnowledge.snapshot();
    return {
      mode: session.kind,
      battle,
      battleBusy: Boolean(battlePlayback && active?.id === battlePlaybackBattleId),
      battleNotice,
      battles: registry.summaries(),
      selectedBattleId: active?.id ?? null,
      playerEntry,
      inventory: playerInventory.snapshot(),
      interaction: structuredClone(interaction),
      searchCueTiles: cues.tiles,
      searchCueRevision: cues.revision
    };
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
  const npcTargets = () => [
    ...(registry.membership('player')
      ? []
      : [
          {
            id: 'player',
            kind: 'player' as const,
            tile: movement.tile,
            position: { ...movement.position }
          }
        ]),
    ...adventurers
      .snapshots()
      .filter((a) => !registry.membership(a.id))
      .map((a) => ({ id: a.id, kind: 'adventurer' as const, tile: a.tile, position: a.position }))
  ];
  const beginPlayerBattle = (goblinId: string, tile = movement.tile) => {
    if (registry.membership('player')) return registry.at(tile);
    relocate(tile);
    const value = registry.create(tile, createBattle(goblinId, sceneAt(tile)));
    searchKnowledge.rememberBattle(value.id);
    goblins.holdForBattle(goblinId);
    closeInventorySession();
    closeInteraction();
    session = { kind: 'battle', battleId: value.id };
    battleNotice = initialBattleNotice();
    advanceFields();
    assignResponders();
    return value;
  };
  const beginNpcBattle = (tile: Point, adventurerId: string, goblinId: string) => {
    if (registry.at(tile) || registry.membership(adventurerId) || registry.membership(goblinId))
      return;
    const battle = createBattle(
      [
        createCombatant(adventurerId, 'player', { col: 2, row: 4 }, 'adventurer'),
        createCombatant(goblinId, 'goblin', { col: 6, row: 4 })
      ],
      sceneAt(tile)
    );
    registry.create(tile, battle);
    adventurers.holdForBattle(adventurerId);
    goblins.holdForBattle(goblinId);
  };
  const joinBattle = (value: WorldBattle) => {
    if (registry.membership('player')) return;
    movement.route = [];
    movement.destination = null;
    registry.queue(value.id, {
      id: 'player',
      kind: 'player',
      approachEdge: 'west',
      arrivalStep: worldStep
    });
    // Entering the battle screen is enough to know its location, even before admission.
    searchKnowledge.rememberBattle(value.id);
    closeInventorySession();
    closeInteraction();
    session = { kind: 'battle', battleId: value.id };
    battleNotice = {
      message: 'Joining the battle at the next turn boundary.',
      revision: 0,
      role: 'status'
    };
  };
  const resolveContacts = () => {
    const here = registry.at(movement.tile);
    if (here && !registry.membership('player')) {
      joinBattle(here);
      return;
    }
    if (!registry.membership('player')) {
      const goblin = goblins
        .snapshots()
        .filter((g) => tileEqual(g.tile, movement.tile) && !registry.membership(g.id))
        .sort((a, b) => a.id.localeCompare(b.id))[0];
      if (goblin) {
        beginPlayerBattle(goblin.id);
        return;
      }
    }
    // Arriving alone at an occupied battle tile is still a reinforcement.
    for (const actor of adventurers.snapshots())
      if (!registry.membership(actor.id)) {
        const battle = registry.at(actor.tile);
        if (
          battle &&
          registry.queue(battle.id, {
            id: actor.id,
            kind: 'adventurer',
            approachEdge: 'west',
            arrivalStep: worldStep
          })
        )
          adventurers.holdForBattle(actor.id);
      }
    for (const actor of goblins.snapshots())
      if (!registry.membership(actor.id)) {
        const battle = registry.at(actor.tile);
        if (
          battle &&
          registry.queue(battle.id, {
            id: actor.id,
            kind: 'goblin',
            approachEdge: 'east',
            arrivalStep: worldStep
          })
        )
          goblins.holdForBattle(actor.id);
      }
    const buckets = new Map<string, { tile: Point; adventurers: string[]; goblins: string[] }>();
    for (const a of adventurers.snapshots())
      if (!registry.membership(a.id)) {
        const key = `${a.tile.col},${a.tile.row}`;
        const b = buckets.get(key) ?? { tile: a.tile, adventurers: [], goblins: [] };
        b.adventurers.push(a.id);
        buckets.set(key, b);
      }
    for (const g of goblins.snapshots())
      if (!registry.membership(g.id)) {
        const key = `${g.tile.col},${g.tile.row}`;
        const b = buckets.get(key) ?? { tile: g.tile, adventurers: [], goblins: [] };
        b.goblins.push(g.id);
        buckets.set(key, b);
      }
    for (const bucket of [...buckets.values()].sort(
      (a, b) => a.tile.row - b.tile.row || a.tile.col - b.tile.col
    )) {
      if (!bucket.adventurers.length || !bucket.goblins.length) continue;
      beginNpcBattle(bucket.tile, bucket.adventurers.sort()[0]!, bucket.goblins.sort()[0]!);
      const battle = registry.at(bucket.tile);
      if (!battle) continue;
      for (const id of bucket.adventurers.slice(1))
        if (
          registry.queue(battle.id, {
            id,
            kind: 'adventurer',
            approachEdge: 'west',
            arrivalStep: worldStep
          })
        )
          adventurers.holdForBattle(id);
      for (const id of bucket.goblins.slice(1))
        if (
          registry.queue(battle.id, {
            id,
            kind: 'goblin',
            approachEdge: 'east',
            arrivalStep: worldStep
          })
        )
          goblins.holdForBattle(id);
    }
  };
  const assignResponders = () => {
    if (map.disableBattleResponses) return;
    const choose = (actor: { id: string; tile: Point }, kind: 'adventurer' | 'goblin') => {
      if (registry.membership(actor.id)) return;
      const nearby = registry
        .all()
        .filter(
          (battle) =>
            (actor.tile.col - battle.tile.col) ** 2 + (actor.tile.row - battle.tile.row) ** 2 <= 64
        );
      // A partial field only proves one route exists; another nearby battle
      // may still reveal a shorter route. Wait for exact bounded distances.
      if (nearby.some((battle) => !fieldFor(battle).done)) return;
      const candidates = nearby
        .map((battle) => ({
          battle,
          field: fieldFor(battle),
          distance: fieldFor(battle).distances.get(routeKey(actor.tile))
        }))
        .filter((candidate) => candidate.distance !== undefined && candidate.distance! <= 64)
        .sort((a, b) => a.distance! - b.distance! || a.battle.id.localeCompare(b.battle.id));
      const best = candidates[0];
      if (!best) return;
      const route: Point[] = [];
      let cursor = { ...actor.tile };
      while (!tileEqual(cursor, best.battle.tile)) {
        const next = best.field.next.get(routeKey(cursor));
        if (!next) return;
        route.push({ ...next });
        cursor = next;
      }
      const accepted =
        kind === 'adventurer'
          ? adventurers.respondToBattleFor(actor.id, best.battle.id, best.battle.tile, route)
          : goblins.respondToBattleFor(actor.id, best.battle.id, best.battle.tile, route);
      if (accepted)
        registry.queue(
          best.battle.id,
          {
            id: actor.id,
            kind,
            approachEdge: kind === 'adventurer' ? 'west' : 'east',
            arrivalStep: worldStep
          },
          best.distance! ? 'traveling' : 'waiting'
        );
    };
    for (const actor of adventurers.snapshots()) choose(actor, 'adventurer');
    for (const actor of goblins.snapshots()) choose(actor, 'goblin');
  };
  const admit = (value: WorldBattle) => {
    const ready = value.arrivals.filter(
      (arrival) => registry.membership(arrival.id)?.stage !== 'traveling'
    );
    const traveling = value.arrivals.filter(
      (arrival) => registry.membership(arrival.id)?.stage === 'traveling'
    );
    const events: BattleEvent[] = [];
    value.arrivals = [...traveling, ...admitReinforcements(value.battle, ready, events)];
    for (const event of events)
      if (event.kind === 'combatant-joined') {
        registry.setStage(event.actorId, 'participating');
        if (value.id === selected()?.id)
          battleNotice = reduceBattleNotice(battleNotice ?? initialBattleNotice(), [event]);
      }
    if (events.length) value.battle.log = [...value.battle.log, ...events].slice(-50);
  };
  const cleanup = (value: WorldBattle) => {
    const actorIds = [
      ...Object.keys(value.battle.combatants),
      ...value.arrivals.map((arrival) => arrival.id)
    ];
    for (const c of Object.values(value.battle.combatants))
      if (c.hp <= 0) {
        if (c.kind !== 'player') dropDeathLoot(value, c.id);
        if (c.kind === 'goblin') goblins.remove(c.id);
        else if (c.kind === 'adventurer') adventurers.remove(c.id);
        if (c.kind !== 'player') inventoryService.unregister(c.id);
      }
    // Completion is the only battle event that converts remembered knowledge into a cue.
    searchKnowledge.finishBattle(value.id, value.tile);
    registry.remove(value.id);
    routeFields.delete(value.id);
    if (registry.all().length === 0) {
      adventurers.clearBattleResponses();
      goblins.clearBattleResponses();
    } else
      for (const id of actorIds) {
        adventurers.releaseBattle(id);
        goblins.releaseBattle(id);
      }
  };
  const lootedDeaths = new Set<string>();
  const dropDeathLoot = (value: WorldBattle, actorId: string) => {
    const token = `${value.id}:${actorId}`;
    if (lootedDeaths.has(token)) return;
    lootedDeaths.add(token);
    const inventory = inventoryService.inventory(actorId);
    if (!inventory) return;
    for (const stack of deterministicLoot(
      map.seed ?? 0,
      value.id,
      actorId,
      inventory.snapshot().stacks
    ))
      inventoryService.drop(actorId, value.tile, stack.id, stack.quantity);
  };
  const complete = (value: WorldBattle) => {
    if (!value.battle.outcome) return false;
    const isSelected = selected()?.id === value.id;
    const playerDead = value.battle.combatants.player?.hp === 0;
    const result = structuredClone(value.battle);
    cleanup(value);
    if (isSelected) {
      if (playerDead) relocate(checkpoints.resolve());
      session = { kind: 'result', battle: result };
      battleNotice = null;
    }
    return true;
  };
  const playerDefeated = (value: WorldBattle) => {
    const player = value.battle.combatants.player;
    if (!player || player.hp > 0) return false;
    const result = structuredClone(value.battle);
    result.outcome = 'defeat';
    result.phase = 'finished';
    delete value.battle.combatants.player;
    value.battle.turnOrder = value.battle.turnOrder.filter((id) => id !== 'player');
    registry.release('player');
    relocate(checkpoints.resolve());
    // Allies can keep a live battle alive after the player has been removed.
    value.battle.outcome = evaluateBattleOutcome(value.battle);
    if (value.battle.outcome) cleanup(value);
    else if (value.battle.activeId === 'player') advanceTurn(value.battle, []);
    session = { kind: 'result', battle: result };
    battleNotice = null;
    return true;
  };
  const resolveBoundary = (value: WorldBattle) => {
    admit(value);
    const outcome = evaluateBattleOutcome(value.battle);
    if (outcome) {
      value.battle.outcome = outcome;
      value.battle.phase = 'finished';
      complete(value);
      return;
    }
    advanceTurn(value.battle, []);
  };
  const finishTurn = (value: WorldBattle) => {
    resolveBoundary(value);
  };
  const beginPlayback = (battleId: BattleId, move: Extract<BattleEvent, { kind: 'move' }>) => {
    battlePlaybackActor = move.actorId;
    battlePlaybackBattleId = battleId;
    battlePlaybackElapsed = 0;
    battlePlayback = createMovement(move.from);
    // The engine's route is authoritative: replay it segment-by-segment so a
    // visual never cuts through an obstacle or a corner.
    battlePlayback.route = move.path.slice(1);
    battlePlayback.destination = move.to;
  };
  const completePlayback = () => {
    battlePlayback = undefined;
    battlePlaybackBattleId = undefined;
    const boundary = pendingBoundary;
    pendingBoundary = undefined;
    if (!boundary || selected()?.id !== boundary.battleId) return;
    const value = registry.get(boundary.battleId);
    if (!value) return;
    if (boundary.advanceWorld) advanceWorld(3, value.id);
    if (selected()?.id === value.id) finishTurn(value);
  };
  /** Commit an engine transition and apply the controller-level consequences.
   * Background battles pass visible=false, leaving their simulation headless. */
  const applyTransition = (
    value: WorldBattle,
    transition: BattleTransition,
    visible: boolean,
    advanceWorldOnBoundary = false
  ) => {
    if ('error' in transition) return false;
    value.battle = transition.state;
    for (const event of transition.events)
      if (event.kind === 'attack' && event.remainingHp === 0) {
        const defeated = value.battle.combatants[event.targetId];
        if (defeated?.kind !== 'player') {
          dropDeathLoot(value, event.targetId);
          inventoryService.unregister(event.targetId);
          if (defeated?.kind === 'goblin') goblins.remove(event.targetId);
          else if (defeated?.kind === 'adventurer') adventurers.remove(event.targetId);
        }
      }
    if (visible)
      battleNotice = reduceBattleNotice(battleNotice ?? initialBattleNotice(), transition.events);
    const move = transition.events.find(
      (event): event is Extract<BattleEvent, { kind: 'move' }> => event.kind === 'move'
    );
    const lethalAttack = transition.events.some(
      (event) => event.kind === 'attack' && event.remainingHp === 0
    );
    const needsBoundary =
      transition.events.some((event) => event.kind === 'turn-ended') || lethalAttack;
    // The player command path advances three seconds for an ordinary turn
    // boundary. A terminal attack resolves immediately and must not advance
    // the world before showing the result.
    const shouldAdvanceWorld = advanceWorldOnBoundary && !lethalAttack;
    if (visible && move) beginPlayback(value.id, move);
    if (visible && playerDefeated(value)) return true;
    if (!needsBoundary) return true;
    if (visible && move) {
      pendingBoundary = { battleId: value.id, advanceWorld: shouldAdvanceWorld };
      return true;
    }
    if (shouldAdvanceWorld) advanceWorld(3, value.id);
    if ((!visible || selected()?.id === value.id) && registry.get(value.id)) finishTurn(value);
    return true;
  };
  const advanceBackground = (dt: number, skip?: BattleId) => {
    for (const value of registry.all()) {
      if (value.id === skip || value.battle.outcome) continue;
      admit(value);
      const actor = value.battle.combatants[value.battle.activeId];
      if (actor?.control !== 'ai') continue;
      value.aiWait += dt;
      if (value.aiWait < ENEMY_ACTION_DELAY_SECONDS) continue;
      value.aiWait = 0;
      const first = applyBattleCommand(value.battle, chooseGoblinCommand(value.battle), {
        deferTurn: true,
        deferOutcome: true
      });
      applyTransition(value, first, false);
    }
  };
  const collectResponses = (value: WorldBattle) => {
    for (const response of adventurers.battleResponses())
      if (response.battleId === value.id)
        if (!registry.membership(response.id))
          registry.queue(
            value.id,
            { ...response, kind: 'adventurer', arrivalStep: worldStep },
            response.arrived ? 'waiting' : 'traveling'
          );
    for (const response of goblins.battleResponses())
      if (response.battleId === value.id)
        if (
          !registry.membership(response.id) &&
          response.id !==
            value.battle.turnOrder.find((id) => value.battle.combatants[id]?.kind === 'goblin')
        )
          registry.queue(
            value.id,
            { ...response, kind: 'goblin', arrivalStep: worldStep },
            response.arrived ? 'waiting' : 'traveling'
          );
    // Travelers are represented in the registry from commitment time; once
    // their simulation reports arrival they become eligible for placement.
    for (const response of [...adventurers.battleResponses(), ...goblins.battleResponses()]) {
      const member = registry.membership(response.id);
      if (!member || member.battleId !== value.id || !response.arrived) continue;
      if (value.battle.combatants[response.id]) continue;
      registry.setStage(response.id, 'waiting');
      if (!value.arrivals.some((arrival) => arrival.id === response.id))
        value.arrivals.push({
          ...response,
          kind: response.id.startsWith('goblin-') ? 'goblin' : 'adventurer',
          arrivalStep: worldStep
        });
    }
  };
  const advanceWorld = (
    seconds: number,
    selectedId?: BattleId,
    afterContacts?: (dt: number) => void
  ) => {
    const steps = Math.round(seconds / STEP);
    for (let index = 0; index < steps && session.kind !== 'result'; index += 1) {
      const dt = STEP;
      worldStep++;
      advanceMovement(movement, dt);
      checkpoints.visit(movement.tile);
      resolveContacts();
      advanceFields();
      assignResponders();
      adventurers.step(dt);
      goblins.step(dt, npcTargets());
      for (const value of registry.all()) collectResponses(value);
      resolveContacts();
      afterContacts?.(dt);
      advanceFields();
      assignResponders();
      advanceBackground(dt, selectedId);
    }
  };
  const requestDestination = (requested: Point) => {
    if (session.kind !== 'exploration' || inventoryPause || interaction.kind !== 'none')
      return null;
    const plan = planNavigation(reader, movement.tile, requested);
    if (!plan) return null;
    movement.route = plan.route;
    movement.destination = plan.destination;
    return plan.destination;
  };
  const pointerDown = (input: PointerInput) => {
    if (!acceptsPointer(input.pointerType, input.button)) return null;
    const requested = tilePointFromPointer(input);
    if (interaction.kind === 'menu' && !tileEqual(requested, movement.tile)) {
      closeInteraction();
      return requestDestination(requested);
    }
    if (
      session.kind === 'exploration' &&
      interaction.kind === 'none' &&
      !movement.route.length &&
      tileEqual(requested, movement.tile)
    ) {
      interaction = openTileActions(requested, Boolean(reader.getTile(requested)?.walkable));
      notify();
      return requested;
    }
    return requestDestination(requested);
  };
  const apply = (command: BattleCommand) => {
    const value = selected();
    if (!value || battlePlayback) return false;
    const transition = applyBattleCommand(value.battle, command, {
      deferTurn: true,
      deferOutcome: true
    });
    const applied = applyTransition(value, transition, true, true);
    if (applied) notify();
    return applied;
  };
  const tick = (deltaSeconds: number) => {
    const elapsed = Math.max(0, deltaSeconds);
    if (session.kind === 'result') return;
    if (session.kind === 'battle') {
      const value = selected();
      if (!value) {
        session = { kind: 'exploration' };
        return;
      }
      if (battlePlayback) {
        battlePlaybackElapsed += elapsed;
        advanceMovement(battlePlayback, elapsed, 6);
        if (!battlePlayback.route.length) completePlayback();
        notify();
        return;
      }
      admit(value);
      const actor = value.battle.combatants[value.battle.activeId];
      if (actor?.control === 'ai') {
        value.aiWait += elapsed;
        if (value.aiWait + 1e-9 >= ENEMY_ACTION_DELAY_SECONDS) {
          value.aiWait = 0;
          const result = applyBattleCommand(value.battle, chooseGoblinCommand(value.battle), {
            deferTurn: true,
            deferOutcome: true
          });
          if (applyTransition(value, result, true)) notify();
        }
      }
      return;
    }
    if (!elapsed) {
      advanceMovement(movement, 0);
      resolveContacts();
      return;
    }
    if (interaction.kind === 'searching') {
      advanceWorld(elapsed, undefined, (dt) => {
        if (interaction.kind === 'searching') {
          const searching = interaction;
          interaction = advanceSearch(
            interaction,
            dt,
            inventoryService.groundAt(interaction.tile),
            random
          );
          if (interaction.kind === 'results')
            searchKnowledge.completeSearch(searching.tile, interaction.foundAny);
        }
      });
      notify();
      return;
    }
    if (inventoryPause && movement.route.length) {
      // Inventory never strands the player between tiles: finish precisely the
      // current edge, then discard the remaining route before world contacts.
      advanceMovement(movement, 1 / TILES_PER_SECOND);
      movement.route = [];
      movement.destination = null;
    }
    advanceWorld(elapsed);
    notify();
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
    battles: registry,
    startBattleForTest: (id: string) => beginPlayerBattle(id),
    get mode() {
      return session.kind;
    },
    get battle() {
      return selected()?.battle ?? (session.kind === 'result' ? session.battle : null);
    },
    dispatchBattle: apply,
    continueFromResult,
    subscribe,
    getSnapshot: snapshot,
    inventory: () => playerInventory.snapshot(),
    openInventory: () => {
      if (session.kind !== 'exploration' || interaction.kind !== 'none') return false;
      inventoryPause = true;
      inventorySessionOpen = true;
      if (!movement.route.length) movement.destination = null;
      return true;
    },
    closeInventory: () => {
      closeInventorySession();
    },
    dropItem: (id: ItemId, quantity: number) => {
      if (session.kind !== 'exploration' || !inventorySessionOpen || movement.route.length)
        return { ok: false as const, error: 'unavailable' as const };
      const result = inventoryService.drop('player', movement.tile, id, quantity);
      if (result.ok) {
        searchKnowledge.markTile(movement.tile);
        notify();
      }
      return result;
    },
    startSearch: () => {
      if (
        session.kind !== 'exploration' ||
        inventorySessionOpen ||
        interaction.kind === 'searching'
      )
        return false;
      interaction = startSearch(interaction);
      if (interaction.kind !== 'searching') return false;
      movement.route = [];
      movement.destination = null;
      notify();
      return true;
    },
    closeInteraction: () => {
      if (interaction.kind === 'searching') return false;
      closeInteraction();
      notify();
      return true;
    },
    takeFoundItem: (id: ItemId, quantity: number) => {
      if (session.kind !== 'exploration' || interaction.kind !== 'results')
        return { ok: false as const, error: 'unavailable' as const };
      const found = interaction.found.find((stack) => stack.id === id)?.quantity ?? 0;
      if (quantity > found) return { ok: false as const, error: 'missing-item' as const };
      const result = inventoryService.takeGround('player', interaction.tile, id, quantity);
      if (result.ok) {
        interaction = {
          ...interaction,
          found: interaction.found
            .map((stack) =>
              stack.id === id ? { ...stack, quantity: stack.quantity - quantity } : stack
            )
            .filter((stack) => stack.quantity > 0)
        };
        notify();
      }
      return result;
    },
    groundAt: inventoryService.groundAt,
    inventoryFor: (actorId: string) => inventoryService.inventory(actorId)?.snapshot() ?? null,
    dropActorItem: (actorId: string, id: ItemId, quantity: number) => {
      if (actorId === 'player' || registry.membership(actorId))
        return { ok: false as const, error: 'unavailable' as const };
      const actor = [...adventurers.snapshots(), ...goblins.snapshots()].find(
        (value) => value.id === actorId
      );
      if (!actor) return { ok: false as const, error: 'unavailable' as const };
      const result = inventoryService.drop(actorId, actor.tile, id, quantity);
      if (result.ok) {
        if (session.kind === 'exploration' && worldViewport && tileCenterInViewport(actor.tile, worldViewport))
          searchKnowledge.markTile(actor.tile);
        notify();
      }
      return result;
    },
    /** Called by the map projection after it has actually displayed active battles. */
    observeBattles: (ids: readonly BattleId[]) => {
      if (session.kind !== 'exploration') return;
      for (const id of ids)
        if (registry.get(id)) searchKnowledge.rememberBattle(id);
    },
    /** World-space CSS-pixel viewport, used only for observation at event time. */
    setWorldViewport: (bounds: WorldViewport | null) => {
      worldViewport = bounds ? { ...bounds } : null;
    }
  };
}
export type GameController = ReturnType<typeof createGameController>;
