<script lang="ts">
  import { onMount } from 'svelte';
  import { Application, Container, Graphics } from 'pixi.js';
  import { createMap, TILE_SIZE } from '../game/map';
  import { findPath, resolveDestination } from '../game/pathfinding';
  import { advanceMovement, createMovement } from '../game/movement';
  import { createPlayerSprite, type PlayerAnimation } from '../game/playerSprite';
  import { drawTileIllustration } from '../game/tileIllustration';
  import type { Point } from '../game/types';

  let host: HTMLElement;
  let status = 'Ready — tap the map to move.';
  let placeName = '';
  const map = createMap();
  const movement = createMovement(map.spawn);
  onMount(() => {
    const app = new Application(); const world = new Container(); world.sortableChildren = true; const marker = new Graphics(); marker.zIndex = -1; const actors = new Container(); actors.sortableChildren = true; const player = createPlayerSprite();
    let camera = { x: 0, y: 0 }; let canvas: HTMLCanvasElement; let locationTimer: ReturnType<typeof setTimeout> | undefined; let lastPlaceId = '';
    void app.init({ background: '#0d1726', antialias: false, resolution: Math.min(window.devicePixelRatio, 2), autoDensity: true, resizeTo: host }).then(() => {
      host.appendChild(app.canvas); canvas = app.canvas; canvas.dataset.testid = 'game-canvas'; app.stage.addChild(world);
      const terrain = new Graphics();
      for (const tile of map.tiles) {
        drawTileIllustration(terrain, tile.kind, tile.col, tile.row);
      }
      world.addChild(terrain);
      for (const feature of map.features ?? []) {
        const landmark = new Graphics(); const x = feature.col * TILE_SIZE + 24; const y = feature.row * TILE_SIZE + 24;
        if (feature.kind === 'gate') landmark.rect(x - 14, y - 18, 28, 36).fill('#69513f').rect(x - 6, y - 10, 12, 28).fill('#2d3d42');
        else landmark.rect(x - 4, y - 18, 8, 36).fill('#d5c294').circle(x, y - 20, 8).fill('#d5c294');
        landmark.zIndex = feature.row * TILE_SIZE + TILE_SIZE;
        actors.addChild(landmark);
      }
      actors.addChild(player.view);
      world.addChild(marker, actors);
      const follow = () => { camera.x = Math.min(0, Math.max(host.clientWidth - map.width * TILE_SIZE, host.clientWidth / 2 - movement.position.x * TILE_SIZE)); camera.y = Math.min(0, Math.max(host.clientHeight - map.height * TILE_SIZE, host.clientHeight / 2 - movement.position.y * TILE_SIZE)); world.position.set(camera.x, camera.y); };
      let animationTime = 0; let lastAnimation: `${PlayerAnimation}:${string}` = 'idle:south';
      const draw = (deltaSeconds = 0) => { const walking = movement.route.length > 0; const animation: PlayerAnimation = walking ? 'walk' : 'idle'; animationTime = lastAnimation === `${animation}:${movement.facing}` ? animationTime + Math.min(deltaSeconds, 0.1) : 0; lastAnimation = `${animation}:${movement.facing}`; const frameIndex = Math.floor(animationTime * (walking ? 10 : 2)) % (walking ? 4 : 2); player.setFrame(animation, movement.facing, frameIndex); player.view.position.set(movement.position.x * TILE_SIZE, movement.position.y * TILE_SIZE); player.view.zIndex = movement.position.y * TILE_SIZE; marker.clear(); if (movement.destination) marker.circle(0, 0, 8).stroke({ color: '#fff3b0', width: 2, alpha: 0.9 }); marker.position.set((movement.destination?.col ?? 0) * TILE_SIZE + 24, (movement.destination?.row ?? 0) * TILE_SIZE + 24); follow(); };
      const updateLocation = () => { const tile = map.tiles[movement.tile.row * map.width + movement.tile.col]; const settlement = tile?.settlementId ? (map.settlements ?? []).find((place) => place.id === tile.settlementId) : undefined; const country = (map.countries ?? []).find((realm) => realm.id === tile?.countryId); const id = settlement?.id ?? country?.id ?? ''; if (id === lastPlaceId) return; lastPlaceId = id; placeName = settlement ? `${settlement.name} · ${settlement.kind}` : country?.name ?? ''; if (locationTimer) clearTimeout(locationTimer); locationTimer = setTimeout(() => { placeName = ''; }, 2600); };
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
