<script lang="ts">
  import { onMount } from 'svelte';
  import { Application, Container, Graphics } from 'pixi.js';
  import { CHUNK_SIZE, createMap, tileAt, TILE_SIZE } from '../game/map';
  import { findPath, resolveDestination } from '../game/pathfinding';
  import { advanceMovement, createMovement } from '../game/movement';
  import { createPlayerSprite, type PlayerAnimation } from '../game/playerSprite';
  import {
    drawTileGround,
    drawTileOverhang,
    fortificationOrientation,
    overhangZIndex
  } from '../game/tileIllustration';
  import type { Point } from '../game/types';

  let host: HTMLElement;
  let status = 'Ready — tap the map to move.';
  let placeName = '';
  const map = createMap();
  const movement = createMovement(map.spawn);
  onMount(() => {
    const app = new Application();
    const world = new Container();
    world.sortableChildren = true;
    const marker = new Graphics();
    marker.zIndex = -1;
    const actors = new Container();
    actors.sortableChildren = true;
    const player = createPlayerSprite();
    let camera = { x: 0, y: 0 };
    let canvas: HTMLCanvasElement;
    let locationTimer: ReturnType<typeof setTimeout> | undefined;
    let lastPlaceId = '';
    void app
      .init({
        background: '#0d1726',
        antialias: false,
        resolution: Math.min(window.devicePixelRatio, 2),
        autoDensity: true,
        resizeTo: host
      })
      .then(() => {
        host.appendChild(app.canvas);
        canvas = app.canvas;
        canvas.dataset.testid = 'game-canvas';
        app.stage.addChild(world);
        // These are Pixi resource registries, not Svelte state.
        // eslint-disable-next-line svelte/prefer-svelte-reactivity
        const chunkViews = new Map<string, Container>();
        const renderChunk = (chunkCol: number, chunkRow: number) => {
          const id = `${chunkCol},${chunkRow}`;
          const view = new Container();
          const ground = new Graphics();
          // eslint-disable-next-line svelte/prefer-svelte-reactivity
          const overhangRows = new Map<number, Graphics>();
          for (let row = chunkRow * CHUNK_SIZE; row < Math.min(map.height, (chunkRow + 1) * CHUNK_SIZE); row++)
            for (let col = chunkCol * CHUNK_SIZE; col < Math.min(map.width, (chunkCol + 1) * CHUNK_SIZE); col++) {
              const tile = tileAt(map, { col, row });
              if (!tile) continue;
              drawTileGround(ground, tile, map);
              if (!['forest', 'rock', 'hill', 'wall', 'gate', 'tower'].includes(tile.kind)) continue;
              let layer = overhangRows.get(tile.row);
              if (!layer) {
                layer = new Graphics();
                layer.zIndex = overhangZIndex(tile.row);
                overhangRows.set(tile.row, layer);
                view.addChild(layer);
              }
              if (tile.kind === 'gate' && fortificationOrientation(tile, map) === 'vertical') {
                drawTileOverhang(layer, tile, map, 'upper');
                drawTileOverhang(layer, tile, map, 'lower');
              } else drawTileOverhang(layer, tile, map);
            }
          view.addChildAt(ground, 0);
          for (const feature of map.features ?? []) {
            if (Math.floor(feature.col / CHUNK_SIZE) !== chunkCol || Math.floor(feature.row / CHUNK_SIZE) !== chunkRow) continue;
            const landmark = new Graphics();
            const x = feature.col * TILE_SIZE + 24;
            const y = feature.row * TILE_SIZE + 24;
            landmark.rect(x - 4, y - 18, 8, 36).fill('#d5c294').circle(x, y - 20, 8).fill('#d5c294');
            landmark.zIndex = feature.row * TILE_SIZE + TILE_SIZE;
            view.addChild(landmark);
          }
          view.sortableChildren = true;
          world.addChild(view);
          chunkViews.set(id, view);
        };
        const syncChunks = () => {
          const center = movement.tile;
          const cx = Math.floor(center.col / CHUNK_SIZE), cy = Math.floor(center.row / CHUNK_SIZE);
          // Keep the visible rectangle plus exactly one chunk of guard space.
          // Chunk dimensions are large in screen pixels, so avoid a fixed
          // multi-chunk radius that would eagerly draw a substantial world.
          const radiusX = Math.ceil(host.clientWidth / (CHUNK_SIZE * TILE_SIZE * 2)) + 1;
          const radiusY = Math.ceil(host.clientHeight / (CHUNK_SIZE * TILE_SIZE * 2)) + 1;
          // eslint-disable-next-line svelte/prefer-svelte-reactivity
          const needed = new Set<string>();
          for (let y = Math.max(0, cy - radiusY); y <= Math.min(Math.ceil(map.height / CHUNK_SIZE) - 1, cy + radiusY); y++)
            for (let x = Math.max(0, cx - radiusX); x <= Math.min(Math.ceil(map.width / CHUNK_SIZE) - 1, cx + radiusX); x++) {
              const id = `${x},${y}`; needed.add(id);
              if (!chunkViews.has(id)) renderChunk(x, y);
            }
          for (const [id, view] of chunkViews) if (!needed.has(id)) { view.destroy({ children: true }); chunkViews.delete(id); }
        };
        syncChunks();
        actors.addChild(player.view);
        world.addChild(marker, actors);
        const follow = () => {
          camera.x = Math.min(
            0,
            Math.max(
              host.clientWidth - map.width * TILE_SIZE,
              host.clientWidth / 2 - movement.position.x * TILE_SIZE
            )
          );
          camera.y = Math.min(
            0,
            Math.max(
              host.clientHeight - map.height * TILE_SIZE,
              host.clientHeight / 2 - movement.position.y * TILE_SIZE
            )
          );
          world.position.set(camera.x, camera.y);
          syncChunks();
        };
        let animationTime = 0;
        let lastAnimation: `${PlayerAnimation}:${string}` = 'idle:south';
        const draw = (deltaSeconds = 0) => {
          const walking = movement.route.length > 0;
          const animation: PlayerAnimation = walking ? 'walk' : 'idle';
          animationTime =
            lastAnimation === `${animation}:${movement.facing}`
              ? animationTime + Math.min(deltaSeconds, 0.1)
              : 0;
          lastAnimation = `${animation}:${movement.facing}`;
          const frameIndex = Math.floor(animationTime * (walking ? 10 : 2)) % (walking ? 4 : 2);
          player.setFrame(animation, movement.facing, frameIndex);
          player.view.position.set(
            movement.position.x * TILE_SIZE,
            movement.position.y * TILE_SIZE
          );
          player.view.zIndex = movement.position.y * TILE_SIZE;
          marker.clear();
          if (movement.destination)
            marker.circle(0, 0, 8).stroke({ color: '#fff3b0', width: 2, alpha: 0.9 });
          marker.position.set(
            (movement.destination?.col ?? 0) * TILE_SIZE + 24,
            (movement.destination?.row ?? 0) * TILE_SIZE + 24
          );
          follow();
        };
        const updateLocation = () => {
          const tile = tileAt(map, movement.tile);
          const settlement = tile?.settlementId
            ? (map.settlements ?? []).find((place) => place.id === tile.settlementId)
            : undefined;
          const country = (map.countries ?? []).find((realm) => realm.id === tile?.countryId);
          const id = settlement?.id ?? country?.id ?? '';
          if (id === lastPlaceId) return;
          lastPlaceId = id;
          placeName = settlement
            ? `${settlement.name} · ${settlement.kind}`
            : (country?.name ?? '');
          if (locationTimer) clearTimeout(locationTimer);
          locationTimer = setTimeout(() => {
            placeName = '';
          }, 2600);
        };
        app.ticker.add((ticker) => {
          const delta = Math.min(ticker.deltaMS / 1000, 0.1);
          advanceMovement(movement, delta);
          updateLocation();
          draw(delta);
        });
        draw();
        canvas.addEventListener('pointerdown', (event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          const rect = canvas.getBoundingClientRect();
          const requested: Point = {
            col: Math.floor((event.clientX - rect.left - camera.x) / TILE_SIZE),
            row: Math.floor((event.clientY - rect.top - camera.y) / TILE_SIZE)
          };
          const destination = resolveDestination(map, movement.tile, requested);
          if (!destination) return;
          movement.route = findPath(map, movement.tile, destination) ?? [];
          movement.destination = destination;
          status = `Moving to column ${destination.col + 1}, row ${destination.row + 1}.`;
        });
      });
    return () => {
      if (locationTimer) clearTimeout(locationTimer);
      app.destroy(true, { children: true, texture: true });
    };
  });
</script>

<section class="game" bind:this={host} aria-label="Emergent RPG map">
  <p class="status" data-testid="player-status" aria-live="polite">{status}</p>
  {#if placeName}<p class="place" data-testid="location-overlay" aria-live="polite">
      {placeName}
    </p>{/if}
</section>
