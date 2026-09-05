import { Application, Container, Graphics } from 'pixi.js';
import { CHUNK_SIZE, chunkRangeForViewport, tileAt, TILE_SIZE } from './map';
import type { WorldMap } from './types';
import type { GameController } from './gameController';
import type { TileStore } from './tileStore';
import { cameraForPlayer } from './camera';
import { locationAt } from './location';
import { createChunkResourceRegistry } from './chunkResources';
import { acceptsPointer, tilePointFromPointer } from './input';
import { createPlayerSprite, type PlayerAnimation } from './playerSprite';
import {
  drawTileGround,
  drawTileOverhang,
  fortificationOrientation,
  fortificationSectionZIndex,
  overhangZIndex
} from './tileIllustration';

export type GameRuntimeOptions = {
  host: HTMLElement;
  map: WorldMap;
  controller: GameController;
  tileStore: TileStore;
  onDestination?: (point: { col: number; row: number }) => void;
  onLocation?: (label: string) => void;
  onError?: () => void;
};
export type GameRuntime = { destroy: () => void };

export function createGameRuntime({
  host,
  map,
  controller,
  tileStore,
  onDestination,
  onLocation,
  onError
}: GameRuntimeOptions): GameRuntime {
  const movement = controller.movement;
  const app = new Application();
  let disposed = false;
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
      if (disposed) {
        app.destroy(true, { children: true, texture: true });
        return;
      }
      initialized = true;
      host.appendChild(app.canvas);
      canvas = app.canvas;
      canvas.dataset.testid = 'game-canvas';
      app.stage.addChild(world);
      // This is a Pixi resource registry, not Svelte state.
      const chunkResources = createChunkResourceRegistry();
      const renderChunk = (chunkCol: number, chunkRow: number) => {
        const id = `${chunkCol},${chunkRow}`;
        const ground = new Graphics();
        const overhangRows = new Map<number, Graphics>();
        const depth: Graphics[] = [];
        for (
          let row = chunkRow * CHUNK_SIZE;
          row < Math.min(map.height, (chunkRow + 1) * CHUNK_SIZE);
          row++
        )
          for (
            let col = chunkCol * CHUNK_SIZE;
            col < Math.min(map.width, (chunkCol + 1) * CHUNK_SIZE);
            col++
          ) {
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
          if (
            Math.floor(feature.col / CHUNK_SIZE) !== chunkCol ||
            Math.floor(feature.row / CHUNK_SIZE) !== chunkRow
          )
            continue;
          const landmark = new Graphics();
          const x = feature.col * TILE_SIZE + 24;
          const y = feature.row * TILE_SIZE + 24;
          landmark
            .rect(x - 4, y - 18, 8, 36)
            .fill('#d5c294')
            .circle(x, y - 20, 8)
            .fill('#d5c294');
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
      const needed = new Set<string>();
        for (let y = range.top; y <= range.bottom; y++)
          for (let x = range.left; x <= range.right; x++) {
            needed.add(`${x},${y}`);
          }
        // Pathfinding can touch tiles beyond the rendered views. Keep that
        // cache bounded even when the camera remains in the same window.
        tileStore.retainChunks(needed);
        if (windowId === lastChunkWindow) return;
        lastChunkWindow = windowId;
        for (const id of needed) {
          if (chunkResources.has(id)) continue;
          const [x, y] = id.split(',').map(Number);
          renderChunk(x, y);
        }
        for (const [id] of chunkResources.values())
          if (!needed.has(id)) {
            chunkResources.destroy(id);
          }
      };
      depthLayer.addChild(player.view);
      world.addChild(groundLayer, marker, depthLayer);
      const updateCamera = () => {
        camera = cameraForPlayer(
          movement.position,
          map,
          {
            width: host.clientWidth,
            height: host.clientHeight
          },
          TILE_SIZE
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
        player.view.position.set(movement.position.x * TILE_SIZE, movement.position.y * TILE_SIZE);
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
        const location = locationAt(map, movement.tile);
        const id = location?.id ?? '';
        if (id === lastPlaceId) return;
        lastPlaceId = id;
        onLocation?.(location?.label ?? '');
        if (locationTimer) clearTimeout(locationTimer);
        locationTimer = setTimeout(() => {
          onLocation?.('');
        }, 2600);
      };
      const tick = (ticker: { deltaMS: number }) => {
        const delta = Math.min(ticker.deltaMS / 1000, 0.1);
        controller.tick(delta);
        updateLocation();
        draw(delta);
      };
      app.ticker.add(tick);
      draw();
      const pointerDown = (event: globalThis.PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        if (!acceptsPointer(event.pointerType, event.button)) return;
        const destination = controller.requestDestination(
          tilePointFromPointer({
            clientX: event.clientX,
            clientY: event.clientY,
            rect,
            camera
          })
        );
        if (!destination) return;
        onDestination?.(destination);
      };
      canvas.addEventListener('pointerdown', pointerDown);
      const dispose = () => {
        if (disposed) return;
        disposed = true;
        app.ticker.remove(tick);
        canvas.removeEventListener('pointerdown', pointerDown);
        if (locationTimer) clearTimeout(locationTimer);
        chunkResources.destroyAll();
        app.destroy(true, { children: true, texture: true });
        tileStore.clear();
      };
      // The component cleanup can happen after initialization; retain the
      // disposer so every listener and ticker is released exactly once.
      cleanup = dispose;
    })
    .catch(() => {
      if (!disposed) onError?.();
    });
  let cleanup: () => void = () => {
    disposed = true;
    if (locationTimer) clearTimeout(locationTimer);
    // If init is still pending, the .then branch observes disposed and
    // destroys the initialized application without attaching its canvas.
    if (initialized) app.destroy(true, { children: true, texture: true });
  };
  return { destroy: () => cleanup() };
}
