<script lang="ts">
  import { onMount } from 'svelte';
  import { createGameController } from '../game/gameController';
  import { createWorld } from '../game/worldGeneration';
  import { createTileStore } from '../game/tileStore';
  import { createGameRuntime } from '../game/gameRuntime';

  let host: HTMLElement;
  let status = 'Ready — tap the map to move.';
  let placeName = '';
  const map = createWorld();
  const tileStore = createTileStore(map);
  const controller = createGameController(map, tileStore);

  onMount(() => {
    const runtime = createGameRuntime({
      host,
      map,
      controller,
      tileStore,
      onDestination: (destination) => {
        status = `Moving to column ${destination.col + 1}, row ${destination.row + 1}.`;
      },
      onLocation: (label) => {
        placeName = label;
      },
      onError: () => {
        status = 'Unable to load the map renderer. Please reload the page.';
      }
    });
    return () => runtime.destroy();
  });
</script>

<section class="game" bind:this={host} aria-label="Emergent RPG map">
  <p class="status" data-testid="player-status" aria-live="polite">{status}</p>
  {#if placeName}
    <p class="place" data-testid="location-overlay" aria-live="polite">{placeName}</p>
  {/if}
</section>
