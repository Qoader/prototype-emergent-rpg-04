<script lang="ts">
  import { onMount } from 'svelte';
  import { createGameController } from '../game/gameController';
  import { createWorld } from '../game/worldGeneration';
  import { createTileStore } from '../game/tileStore';
  import { createGameRuntime } from '../game/gameRuntime';
  import BattleScreen from './BattleScreen.svelte';
  import { createBattleFixture } from '../game/e2eBattleFixture';

  let host: HTMLElement;
  let status = '';
  let placeName = '';
  const map = window.location.search.includes('battle-fixture') ? createBattleFixture(!window.location.search.includes('battle-fixture-solo'), !window.location.search.includes('battle-fixture-defeat')) : createWorld();
  const tileStore = createTileStore(map);
  const controller = createGameController(map, tileStore);
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
      onError: () => {
        status = 'Unable to load the map renderer. Please reload the page.';
      }
    });
    return () => { unsubscribe(); runtime.destroy(); };
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
