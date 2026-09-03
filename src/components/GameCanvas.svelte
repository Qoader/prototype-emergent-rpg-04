<script lang="ts">
  import { onMount } from 'svelte';
  import { Application, Container, Graphics } from 'pixi.js';
  import { CHUNK_SIZE, chunkRangeForViewport, createMap, evictChunkCache, tileAt, TILE_SIZE } from '../game/map';
  import { findPath, resolveDestination } from '../game/pathfinding';
  import { advanceMovement, createMovement } from '../game/movement';
  import { createPlayerSprite, type PlayerAnimation } from '../game/playerSprite';
  import {
    drawTileGround,
    drawTileOverhang,
    fortificationOrientation,
    fortificationSectionZIndex,
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
    let initialized = false;
    const world = new Container();
    const groundLayer = new Container();
    const marker = new Graphics();
    const depthLayer = new Container();
    depthLayer.sortableChildren = true;
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
        initialized = true;
        host.appendChild(app.canvas);
        canvas = app.canvas;
        canvas.dataset.testid = 'game-canvas';
        app.stage.addChild(world);
        type ChunkResources = { ground: Graphics; depth: Graphics[] };
        // This is a Pixi resource registry, not Svelte state.
        // eslint-disable-next-line svelte/prefer-svelte-reactivity
        const chunkResources = new Map<string, ChunkResources>();
        const renderChunk = (chunkCol: number, chunkRow: number) => {
          const id = `${chunkCol},${chunkRow}`;
          const ground = new Graphics();
          // eslint-disable-next-line svelte/prefer-svelte-reactivity
          const overhangRows = new Map<number, Graphics>();
          const depth: Graphics[] = [];
          for (let row = chunkRow * CHUNK_SIZE; row < Math.min(map.height, (chunkRow + 1) * CHUNK_SIZE); row++)
            for (let col = chunkCol * CHUNK_SIZE; col < Math.min(map.width, (chunkCol + 1) * CHUNK_SIZE); col++) {
              const tile = tileAt(map, { col, row });
              if (!tile) continue;
              drawTileGround(ground, tile, map);
              if (!['forest', 'rock', 'hill', 'wall', 'gate', 'tower'].includes(tile.kind)) continue;
              if (tile.kind === 'gate' && fortificationOrientation(tile, map) === 'vertical') {
                // A vertical gate has a passable opening between its two
                // sections, so each section needs its own depth position.
                const upper = new Graphics();
                upper.zIndex = fortificationSectionZIndex(tile.row, 'upper');
                drawTileOverhang(upper, tile, map, 'upper');
                depthLayer.addChild(upper);
                depth.push(upper);
                const lower = new Graphics();
                lower.zIndex = fortificationSectionZIndex(tile.row, 'lower');
                drawTileOverhang(lower, tile, map, 'lower');
                depthLayer.addChild(lower);
                depth.push(lower);
              } else {
                let layer = overhangRows.get(tile.row);
                if (!layer) {
                  layer = new Graphics();
                  layer.zIndex = overhangZIndex(tile.row);
                  overhangRows.set(tile.row, layer);
                  depthLayer.addChild(layer);
                  depth.push(layer);
                }
                drawTileOverhang(layer, tile, map);
              }
            }
          groundLayer.addChild(ground);
          for (const feature of map.features ?? []) {
            if (Math.floor(feature.col / CHUNK_SIZE) !== chunkCol || Math.floor(feature.row / CHUNK_SIZE) !== chunkRow) continue;
            const landmark = new Graphics();
            const x = feature.col * TILE_SIZE + 24;
            const y = feature.row * TILE_SIZE + 24;
            landmark.rect(x - 4, y - 18, 8, 36).fill('#d5c294').circle(x, y - 20, 8).fill('#d5c294');
            landmark.zIndex = feature.row * TILE_SIZE + TILE_SIZE;
            depthLayer.addChild(landmark);
            depth.push(landmark);
          }
          chunkResources.set(id, { ground, depth });
        };
        let lastChunkWindow = '';
        const syncChunks = () => {
          const range = chunkRangeForViewport(map, camera, {
            width: host.clientWidth,
            height: host.clientHeight
          });
          const windowId = `${range.left},${range.top},${range.right},${range.bottom}`;
          // eslint-disable-next-line svelte/prefer-svelte-reactivity
          const needed = new Set<string>();
          for (let y = range.top; y <= range.bottom; y++)
            for (let x = range.left; x <= range.right; x++) {
              needed.add(`${x},${y}`);
            }
          // Pathfinding can touch tiles beyond the rendered views. Keep that
          // cache bounded even when the camera remains in the same window.
          evictChunkCache(map, needed);
          if (windowId === lastChunkWindow) return;
          lastChunkWindow = windowId;
          for (const id of needed) {
            if (chunkResources.has(id)) continue;
            const [x, y] = id.split(',').map(Number);
            renderChunk(x, y);
          }
          for (const [id, resources] of chunkResources)
            if (!needed.has(id)) {
              resources.ground.destroy();
              for (const item of resources.depth) item.destroy();
              chunkResources.delete(id);
            }
        };
        depthLayer.addChild(player.view);
        world.addChild(groundLayer, marker, depthLayer);
        const updateCamera = () => {
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
        };
        // Calculate the initial camera before selecting the first render window.
        updateCamera();
        syncChunks();
        const follow = () => {
          updateCamera();
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
      })
      .catch(() => {
        status = 'Unable to load the map renderer. Please reload the page.';
      });
    return () => {
      if (locationTimer) clearTimeout(locationTimer);
      if (initialized) app.destroy(true, { children: true, texture: true });
    };
  });
</script>

<section class="game" bind:this={host} aria-label="Emergent RPG map">
  <p class="status" data-testid="player-status" aria-live="polite">{status}</p>
  {#if placeName}<p class="place" data-testid="location-overlay" aria-live="polite">
      {placeName}
    </p>{/if}
</section>
