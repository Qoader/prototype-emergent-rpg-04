<script lang="ts">
  import { onMount } from 'svelte';
  import { createGameController } from '../game/gameController';
  import { createWorld } from '../game/worldGeneration';
  import { createTileStore } from '../game/tileStore';
  import { createGameRuntime } from '../game/gameRuntime';
  import type { RuntimeFailure } from '../game/gameRuntime';
  import BattleScreen from './BattleScreen.svelte';
  import { createBattleFixture, createReinforcementBattleFixture } from '../game/e2eBattleFixture';
  import { tileAt } from '../game/map';

  let host: HTMLElement;
  let status = '';
  let placeName = '';
  const stabilityFixture = window.location.search.includes('battle-stability');
  const reinforcementFixture = window.location.search.includes('battle-fixture-reinforcement');
  const soloFixture = window.location.search.includes('battle-fixture-solo');
  const defeatFixture = window.location.search.includes('battle-fixture-defeat');
  const map = reinforcementFixture
    ? createReinforcementBattleFixture()
    : window.location.search.includes('battle-fixture')
    ? createBattleFixture(
        !soloFixture && !defeatFixture,
        !defeatFixture
      )
    : createWorld(stabilityFixture ? 7331 : undefined);
  if (stabilityFixture && map.goblinNests?.[0]) {
    const nest = map.goblinNests[0];
    const spawn = { ...map.spawn };
    const candidates = Array.from({ length: map.width * map.height }, (_, index) => ({
      col: index % map.width,
      row: Math.floor(index / map.width)
    })).filter(
      (point) =>
        Math.abs(point.col - spawn.col) + Math.abs(point.row - spawn.row) > 8 &&
        tileAt(map, point)?.walkable
    );
    map.goblinNests = [
      { ...nest, spawnTiles: [spawn, candidates[0] ?? spawn, candidates[1] ?? spawn] },
      ...map.goblinNests.slice(1)
    ];
  }
  const tileStore = createTileStore(map);
  const controller = createGameController(map, tileStore);
  if (reinforcementFixture) {
    const target = (tile: { col: number; row: number }) => [
      { id: 'adventurer-target', kind: 'adventurer' as const, tile }
    ];
    controller.goblins.tick(0.2, target({ col: 13, row: 3 }));
    for (let index = 0; index < 12; index += 1) controller.goblins.tick(0.1, target({ col: 13, row: 3 }));
    for (let index = 0; index < 12; index += 1) controller.goblins.tick(0.1, target({ col: 10, row: 3 }));
    for (let index = 0; index < 12; index += 1) controller.goblins.tick(0.1, target({ col: 13, row: 3 }));
    controller.startBattleForTest('goblin-reinforcement-battle-0');
    const primary = controller.battle?.combatants['goblin-reinforcement-battle-0'];
    if (primary) primary.position = { col: 5, row: 4 };
  }
  if (stabilityFixture && map.goblinNests?.[0]) {
    const id = `goblin-${map.goblinNests[0].id}-0`;
    controller.startBattleForTest(id);
    const goblin = controller.battle?.combatants[id];
    if (goblin) goblin.position = { col: 5, row: 4 };
    if (controller.battle) controller.battle.combatants.player.ap = 2;
  }
  if (stabilityFixture && map.goblinNests?.[0]) {
    (
      window as typeof globalThis & { __startBattleStabilityEncounter?: (index: number) => void }
    ).__startBattleStabilityEncounter = (index) => {
      const id = `goblin-${map.goblinNests![0]!.id}-${index}`;
      controller.startBattleForTest(id);
      const goblin = controller.battle?.combatants[id];
      if (goblin) goblin.position = { col: 5, row: 4 };
      if (controller.battle) controller.battle.combatants.player.ap = 2;
    };
  }
  if (window.location.search.includes('battle-fixture-defeat')) {
    controller.movement.tile = { col: 4, row: 4 };
    controller.movement.position = { x: 4.5, y: 4.5 };
    controller.movement.route = [];
    controller.movement.destination = null;
  }
  if (window.location.search.includes('battle-fixture-defeat'))
    controller.startBattleForTest('goblin-fixture-nest-0');
  let snapshot = controller.getSnapshot();
  $: mode = snapshot.mode;

  onMount(() => {
    const unsubscribe = controller.subscribe((next) => {
      snapshot = next;
    });
    const runtime = createGameRuntime({
      host,
      map,
      controller,
      tileStore,
      onLocation: (label) => {
        placeName = label;
      },
      onError: (failure: RuntimeFailure) => {
        void failure;
        status = 'Unable to load the map renderer. Please reload the page.';
      }
    });
    return () => {
      unsubscribe();
      runtime.destroy();
      if (stabilityFixture)
        delete (
          window as typeof globalThis & {
            __startBattleStabilityEncounter?: (index: number) => void;
          }
        ).__startBattleStabilityEncounter;
    };
  });
</script>

<section class="game" bind:this={host} aria-label="Emergent RPG map">
  {#if mode !== 'exploration'}<BattleScreen
      battle={snapshot.battle}
      battleBusy={snapshot.battleBusy}
      battleNotice={snapshot.battleNotice}
      dispatch={controller.dispatchBattle}
      continueFromResult={controller.continueFromResult}
    />{/if}
  {#if status}
    <p class="status" data-testid="player-status" aria-live="polite">{status}</p>
  {/if}
  {#if placeName}
    <p class="place" data-testid="location-overlay" aria-live="polite">{placeName}</p>
  {/if}
</section>
