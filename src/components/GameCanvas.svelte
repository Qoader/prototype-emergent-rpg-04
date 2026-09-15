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
  import GameMenu from './GameMenu.svelte';
  import InventoryDialog from './InventoryDialog.svelte';
  import SearchDialog from './SearchDialog.svelte';

  let host: HTMLElement;
  let status = '';
  let placeName = '';
  const stabilityFixture = window.location.search.includes('battle-stability');
  const reinforcementFixture = window.location.search.includes('battle-fixture-reinforcement');
  const soloFixture = window.location.search.includes('battle-fixture-solo');
  const defeatFixture = window.location.search.includes('battle-fixture-defeat');
  const inventoryFixture = window.location.search.includes('inventory-fixture');
  const searchFixture = window.location.search.includes('search-fixture');
  const map = reinforcementFixture
    ? createReinforcementBattleFixture()
    : inventoryFixture || searchFixture
      ? createBattleFixture(false, false)
      : window.location.search.includes('battle-fixture')
        ? createBattleFixture(!soloFixture && !defeatFixture, !defeatFixture)
        : createWorld(stabilityFixture ? 7331 : undefined);
  // Browser inventory fixture deliberately has no roaming actors: it proves
  // exploration UI without an encounter race before the first interaction.
  if (inventoryFixture || searchFixture) map.goblinNests = [];
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
  const controller = createGameController(map, tileStore, searchFixture ? { random: () => 0 } : {});
  if (searchFixture)
    (window as typeof globalThis & { __advanceSearchFixture?: () => void }).__advanceSearchFixture =
      () => controller.tick(5);
  if (reinforcementFixture) {
    const target = (tile: { col: number; row: number }) => [
      { id: 'adventurer-target', kind: 'adventurer' as const, tile }
    ];
    controller.goblins.tick(0.2, target({ col: 13, row: 3 }));
    for (let index = 0; index < 12; index += 1)
      controller.goblins.tick(0.1, target({ col: 13, row: 3 }));
    for (let index = 0; index < 12; index += 1)
      controller.goblins.tick(0.1, target({ col: 10, row: 3 }));
    for (let index = 0; index < 12; index += 1)
      controller.goblins.tick(0.1, target({ col: 13, row: 3 }));
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
  let inventoryOpen = false;
  let playerScreen = { x: 0, y: 0, width: 0, height: 0 };
  $: menuPosition = {
    left: Math.max(8, Math.min(playerScreen.x + 16, playerScreen.width - 176)),
    top: Math.max(8, Math.min(playerScreen.y - 72, playerScreen.height - 96))
  };
  const openInventory = () => {
    if (controller.openInventory()) inventoryOpen = true;
  };
  const closeInventory = () => {
    inventoryOpen = false;
    controller.closeInventory();
  };
  $: if (mode !== 'exploration' && inventoryOpen) closeInventory();

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
      onPlayerScreenPosition: (position) => {
        playerScreen = position;
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
      if (searchFixture)
        delete (window as typeof globalThis & { __advanceSearchFixture?: () => void })
          .__advanceSearchFixture;
    };
  });
</script>

<section class="game" bind:this={host} aria-label="Emergent RPG map">
  <i
    class="player-screen-anchor"
    data-testid="player-screen-anchor"
    aria-hidden="true"
    style:left={`${playerScreen.x}px`}
    style:top={`${playerScreen.y}px`}
  ></i>
  {#if mode === 'exploration'}<GameMenu onInventory={openInventory} />{/if}
  <InventoryDialog
    open={inventoryOpen && mode === 'exploration'}
    inventory={snapshot.inventory}
    dropsEnabled={inventoryOpen && !controller.movement.route.length}
    onClose={closeInventory}
    onDrop={(id, quantity) => controller.dropItem(id, quantity)}
  />
  <SearchDialog
    interaction={snapshot.interaction}
    {menuPosition}
    onSearch={controller.startSearch}
    onClose={controller.closeInteraction}
    onTake={controller.takeFoundItem}
  />
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
