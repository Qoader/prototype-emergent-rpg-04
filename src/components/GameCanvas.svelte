<script lang="ts">
  import { onMount } from 'svelte';
  import { createGameController } from '../game/gameController';
  import { createWorld } from '../game/worldGeneration';
  import { createTileStore } from '../game/tileStore';
  import { createGameRuntime } from '../game/gameRuntime';
  import BattleScreen from './BattleScreen.svelte';

  let host: HTMLElement;
  let status = '';
  let placeName = '';
  const map = createWorld();
  const tileStore = createTileStore(map);
  const controller = createGameController(map, tileStore);
  let mode = controller.mode;

  onMount(() => {
    const unsubscribe = controller.subscribe(() => { mode = controller.mode; });
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
  {#if mode !== 'exploration'}<BattleScreen {controller} />{/if}
  {#if status}
    <p class="status" data-testid="player-status" aria-live="polite">{status}</p>
  {/if}
  {#if placeName}
    <p class="place" data-testid="location-overlay" aria-live="polite">{placeName}</p>
  {/if}
</section>
