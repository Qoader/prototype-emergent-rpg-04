<script lang="ts">
  import { onMount } from 'svelte';
  import { Application, Container, Graphics } from 'pixi.js';
  import { createMap, TILE_SIZE } from '../game/map';
  import { findPath, resolveDestination } from '../game/pathfinding';
  import { advanceMovement, createMovement } from '../game/movement';
  import { createPlayerSprite, type PlayerAnimation } from '../game/playerSprite';
  import type { Point, TileKind } from '../game/types';

  let host: HTMLElement;
  let status = 'Ready — tap the map to move.';
  let placeName = '';
  const map = createMap();
  const movement = createMovement(map.spawn);
  const colors: Record<TileKind, string> = { grass: '#5f9165', flower: '#7fa56e', water: '#3c7798', rock: '#77777a', forest: '#416d54', hill: '#7f875f', sand: '#c7a96d', road: '#b89462', bridge: '#8b623e' };

  onMount(() => {
    const app = new Application(); const world = new Container(); world.sortableChildren = true; const marker = new Graphics(); marker.zIndex = -1; const actors = new Container(); actors.sortableChildren = true; const player = createPlayerSprite();
    let camera = { x: 0, y: 0 }; let canvas: HTMLCanvasElement; let locationTimer: ReturnType<typeof setTimeout> | undefined; let lastPlaceId = '';
    void app.init({ background: '#0d1726', antialias: false, resolution: Math.min(window.devicePixelRatio, 2), autoDensity: true, resizeTo: host }).then(() => {
      host.appendChild(app.canvas); canvas = app.canvas; canvas.dataset.testid = 'game-canvas'; app.stage.addChild(world);
      const terrain = new Graphics();
      for (const tile of map.tiles) {
        terrain.rect(tile.col * TILE_SIZE, tile.row * TILE_SIZE, TILE_SIZE, TILE_SIZE).fill(colors[tile.kind]);
        if (tile.kind === 'flower' && (tile.col * 13 + tile.row * 7) % 4 === 0) terrain.circle(tile.col * TILE_SIZE + 8, tile.row * TILE_SIZE + 9, 1.5).fill('#f5cfba');
        if (tile.kind === 'hill' && (tile.col + tile.row) % 4 === 0) terrain.poly([tile.col * TILE_SIZE + 3, tile.row * TILE_SIZE + 19, tile.col * TILE_SIZE + 12, tile.row * TILE_SIZE + 5, tile.col * TILE_SIZE + 21, tile.row * TILE_SIZE + 19]).fill('#707852');
      }
      world.addChild(terrain);
      for (const tile of map.tiles.filter((tile) => tile.kind === 'forest' && (tile.col + tile.row * 3) % 3 === 0)) {
        const tree = new Graphics(); const x = tile.col * TILE_SIZE + 12; const y = tile.row * TILE_SIZE + 12;
        tree.circle(x, y - 3, 8).fill('#315b45').rect(x - 2, y + 3, 4, 7).fill('#654534'); tree.zIndex = y + 7; actors.addChild(tree);
      }
      for (const settlement of map.settlements ?? []) {
        const landmark = new Graphics(); const x = settlement.col * TILE_SIZE + 12; const y = settlement.row * TILE_SIZE + 12; const size = settlement.kind === 'capital' ? 18 : settlement.kind === 'city' ? 14 : 10;
        landmark.circle(x + 2, y + 4, size * 0.85).fill({ color: '#264235', alpha: 0.25 }).rect(x - size / 2, y - 1, size, size * 0.7).fill(settlement.kind === 'capital' ? '#d8bf8d' : '#d5b47c').poly([x - size / 2 - 2, y - 1, x, y - size * 0.85, x + size / 2 + 2, y - 1]).fill(settlement.kind === 'capital' ? '#9d4f4e' : '#8f5a4b');
        if (settlement.kind !== 'village') landmark.rect(x - 2, y - size * 0.6, 4, size * 0.42).fill('#f1dfad'); landmark.zIndex = y + size / 2; actors.addChild(landmark);
      }
      for (const feature of map.features ?? []) { const landmark = new Graphics(); const x = feature.col * TILE_SIZE + 12; const y = feature.row * TILE_SIZE + 12; if (feature.kind === 'gate') landmark.rect(x - 7, y - 9, 14, 18).fill('#69513f').rect(x - 3, y - 5, 6, 14).fill('#2d3d42'); else landmark.rect(x - 2, y - 9, 4, 18).fill('#d5c294').circle(x, y - 10, 4).fill('#d5c294'); landmark.zIndex = y + 9; actors.addChild(landmark); }
      actors.addChild(player.view);
      world.addChild(marker, actors);
      const follow = () => { camera.x = Math.min(0, Math.max(host.clientWidth - map.width * TILE_SIZE, host.clientWidth / 2 - movement.position.x * TILE_SIZE)); camera.y = Math.min(0, Math.max(host.clientHeight - map.height * TILE_SIZE, host.clientHeight / 2 - movement.position.y * TILE_SIZE)); world.position.set(camera.x, camera.y); };
      let animationTime = 0; let lastAnimation: `${PlayerAnimation}:${string}` = 'idle:south';
      const draw = (deltaSeconds = 0) => { const walking = movement.route.length > 0; const animation: PlayerAnimation = walking ? 'walk' : 'idle'; animationTime = lastAnimation === `${animation}:${movement.facing}` ? animationTime + Math.min(deltaSeconds, 0.1) : 0; lastAnimation = `${animation}:${movement.facing}`; const frameIndex = Math.floor(animationTime * (walking ? 10 : 2)) % (walking ? 4 : 2); player.setFrame(animation, movement.facing, frameIndex); player.view.position.set(movement.position.x * TILE_SIZE, movement.position.y * TILE_SIZE); player.view.zIndex = movement.position.y * TILE_SIZE + 1; marker.clear(); if (movement.destination) marker.circle(0, 0, 8).stroke({ color: '#fff3b0', width: 2, alpha: 0.9 }); marker.position.set((movement.destination?.col ?? 0) * TILE_SIZE + 12, (movement.destination?.row ?? 0) * TILE_SIZE + 12); follow(); };
      const updateLocation = () => { const settlement = (map.settlements ?? []).find((place) => Math.hypot(place.col - movement.tile.col, place.row - movement.tile.row) <= place.radius); const country = (map.countries ?? []).find((realm) => realm.id === map.tiles[movement.tile.row * map.width + movement.tile.col]?.countryId); const id = settlement?.id ?? country?.id ?? ''; if (!id || id === lastPlaceId) return; lastPlaceId = id; placeName = settlement ? `${settlement.name} · ${settlement.kind}` : country?.name ?? ''; if (locationTimer) clearTimeout(locationTimer); locationTimer = setTimeout(() => { placeName = ''; }, 2600); };
      app.ticker.add((ticker) => { const delta = Math.min(ticker.deltaMS / 1000, 0.1); advanceMovement(movement, delta); updateLocation(); draw(delta); }); draw();
      canvas.addEventListener('pointerdown', (event) => { if (event.pointerType === 'mouse' && event.button !== 0) return; const rect = canvas.getBoundingClientRect(); const requested: Point = { col: Math.floor((event.clientX - rect.left - camera.x) / TILE_SIZE), row: Math.floor((event.clientY - rect.top - camera.y) / TILE_SIZE) }; const destination = resolveDestination(map, movement.tile, requested); if (!destination) return; movement.route = findPath(map, movement.tile, destination) ?? []; movement.destination = destination; status = `Moving to column ${destination.col + 1}, row ${destination.row + 1}.`; });
    });
    return () => { if (locationTimer) clearTimeout(locationTimer); app.destroy(true, { children: true, texture: true }); };
  });
</script>

<section class="game" bind:this={host} aria-label="Emergent RPG map">
  <p class="status" data-testid="player-status" aria-live="polite">{status}</p>
  {#if placeName}<p class="place" data-testid="location-overlay" aria-live="polite">{placeName}</p>{/if}
</section>
