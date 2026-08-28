<script lang="ts">
  import { onMount } from 'svelte';
  import { Application, Container, Graphics } from 'pixi.js';
  import { createMap, TILE_SIZE } from '../game/map';
  import { findPath, resolveDestination } from '../game/pathfinding';
  import { advanceMovement, createMovement } from '../game/movement';
  import type { Point } from '../game/types';

  let host: HTMLElement;
  let status = 'Ready — tap the map to move.';
  const map = createMap();
  const movement = createMovement(map.spawn);

  onMount(() => {
    const app = new Application();
    const world = new Container();
    const player = new Graphics();
    const marker = new Graphics();
    let camera = { x: 0, y: 0 };
    let canvas: HTMLCanvasElement;

    void app.init({ background: '#0d1726', antialias: false, resolution: Math.min(window.devicePixelRatio, 2), autoDensity: true, resizeTo: host }).then(() => {
      host.appendChild(app.canvas);
      canvas = app.canvas;
      canvas.dataset.testid = 'game-canvas';
      app.stage.addChild(world);
      for (const tile of map.tiles) {
        const color = tile.kind === 'water' ? '#23627a' : tile.kind === 'rock' ? '#53606d' : tile.kind === 'flower' ? '#4d9b67' : '#34734f';
        world.addChild(new Graphics().rect(tile.col * TILE_SIZE, tile.row * TILE_SIZE, TILE_SIZE - 1, TILE_SIZE - 1).fill(color));
      }
      world.addChild(marker, player);
      const resize = () => {
        camera.x = Math.min(0, Math.max(host.clientWidth - map.width * TILE_SIZE, host.clientWidth / 2 - movement.position.x * TILE_SIZE));
        camera.y = Math.min(0, Math.max(host.clientHeight - map.height * TILE_SIZE, host.clientHeight / 2 - movement.position.y * TILE_SIZE));
        world.position.set(camera.x, camera.y);
      };
      const draw = () => {
        player.clear().circle(0, 0, 11).fill('#ffd166').circle(-4, -2, 2).fill('#14213d').circle(4, -2, 2).fill('#14213d');
        player.position.set(movement.position.x * TILE_SIZE, movement.position.y * TILE_SIZE);
        marker.clear();
        if (movement.destination) marker.circle(0, 0, 9).stroke({ color: '#fff3b0', width: 3, alpha: 0.9 });
        marker.position.set((movement.destination?.col ?? 0) * TILE_SIZE + TILE_SIZE / 2, (movement.destination?.row ?? 0) * TILE_SIZE + TILE_SIZE / 2);
        resize();
      };
      app.ticker.add((ticker) => { advanceMovement(movement, ticker.deltaMS / 1000); draw(); });
      draw();
      canvas.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        const rect = canvas.getBoundingClientRect();
        const requested: Point = { col: Math.floor((event.clientX - rect.left - camera.x) / TILE_SIZE), row: Math.floor((event.clientY - rect.top - camera.y) / TILE_SIZE) };
        const destination = resolveDestination(map, movement.tile, requested);
        if (!destination) return;
        movement.route = findPath(map, movement.tile, destination) ?? [];
        movement.destination = destination;
        status = `Moving to column ${destination.col + 1}, row ${destination.row + 1}.`;
      });
    });
    return () => { app.destroy(true, { children: true, texture: true }); };
  });
</script>

<section class="game" bind:this={host} aria-label="Emergent RPG map">
  <p class="status" data-testid="player-status" aria-live="polite">{status}</p>
</section>
