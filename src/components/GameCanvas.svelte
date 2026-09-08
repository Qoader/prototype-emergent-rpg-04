<script lang="ts">
  import { onMount } from 'svelte';
  import { createGameController } from '../game/gameController';
  import { createWorld } from '../game/worldGeneration';
  import { createTileStore } from '../game/tileStore';
  import { createGameRuntime } from '../game/gameRuntime';
  import type { RuntimeFailure } from '../game/gameRuntime';
  import BattleScreen from './BattleScreen.svelte';
  import { createBattleFixture } from '../game/e2eBattleFixture';
  import { tileAt } from '../game/map';

  let host: HTMLElement;
  let status = '';
  let placeName = '';
  const stabilityFixture = window.location.search.includes('battle-stability');
  const map = window.location.search.includes('battle-fixture')
    ? createBattleFixture(!window.location.search.includes('battle-fixture-solo'), !window.location.search.includes('battle-fixture-defeat'))
    : createWorld(stabilityFixture ? 7331 : undefined);
  if (stabilityFixture && map.goblinNests?.[0]) {
    const nest = map.goblinNests[0];
    const spawn = { ...map.spawn };
    const candidates = Array.from({ length: map.width * map.height }, (_, index) => ({ col: index % map.width, row: Math.floor(index / map.width) }))
      .filter((point) => Math.abs(point.col - spawn.col) + Math.abs(point.row - spawn.row) > 8 && tileAt(map, point)?.walkable);
    map.goblinNests = [{ ...nest, spawnTiles: [spawn, candidates[0] ?? spawn, candidates[1] ?? spawn] }, ...(map.goblinNests.slice(1))];
  }
  const tileStore = createTileStore(map);
  const controller = createGameController(map, tileStore);
  if (stabilityFixture && map.goblinNests?.[0]) controller.startBattleForTest(`goblin-${map.goblinNests[0].id}-0`);
  if (stabilityFixture && map.goblinNests?.[0]) {
    (window as typeof globalThis & { __startBattleStabilityEncounter?: (index: number) => void }).__startBattleStabilityEncounter = (index) => {
      controller.startBattleForTest(`goblin-${map.goblinNests![0]!.id}-${index}`);
    };
  }
  if (window.location.search.includes('battle-fixture-defeat')) controller.startBattleForTest('goblin-fixture-nest-0');
  let snapshot = controller.getSnapshot();
  $: mode = snapshot.mode;

  onMount(() => {
    const unsubscribe = controller.subscribe((next) => { snapshot = next; });
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
      unsubscribe(); runtime.destroy();
      if (stabilityFixture) delete (window as typeof globalThis & { __startBattleStabilityEncounter?: (index: number) => void }).__startBattleStabilityEncounter;
    };
  });
</script>

<section class="game" bind:this={host} aria-label="Emergent RPG map">
  {#if mode !== 'exploration'}<BattleScreen battle={snapshot.battle} dispatch={controller.dispatchBattle} continueFromResult={controller.continueFromResult} />{/if}
  {#if status}
    <p class="status" data-testid="player-status" aria-live="polite">{status}</p>
  {/if}
  {#if placeName}
    <p class="place" data-testid="location-overlay" aria-live="polite">{placeName}</p>
  {/if}
</section>
