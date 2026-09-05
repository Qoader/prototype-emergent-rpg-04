# Emergent RPG

Mobile-first 2D RPG movement prototype built with Svelte, PixiJS, Vite, and TypeScript.

## Development

Requires Node 24 and pnpm 11.

```bash
pnpm install
pnpm dev
```

Quality checks:

```bash
pnpm check
pnpm lint
pnpm test:unit
pnpm build
pnpm test:e2e
```

The map is procedural but seeded, so movement and pathfinding are deterministic. Click or tap a tile to route the player; blocked destinations resolve to the nearest reachable tile. The workflow on `main` runs static checks, unit tests, and the production build before publishing `dist/` to `gh-pages`. E2E tests remain available locally with `pnpm test:e2e`; in repository Settings → Pages, select the `gh-pages` branch and root directory as the source.

## Module ownership

- `src/game/map.ts` owns deterministic world authoring and terrain rules. It does not depend on Pixi or browser APIs.
- `src/game/tileStore.ts` exposes read-only tile access and owns procedural cache eviction.
- `src/game/pathfinding.ts` owns bounded route planning; callers receive the destination and the route as one result.
- `src/game/gameController.ts` owns movement state and accepts logical tile requests. Canvas coordinate conversion remains its input adapter.
- `src/game/camera.ts` and `src/game/location.ts` contain pure camera and world-location queries.
- `src/game/tileIllustration.ts` and `src/game/playerSprite.ts` own Pixi drawing primitives.
- `GameCanvas.svelte` composes the runtime and presentation lifecycle. Pixi listeners, tickers, and asynchronous initialization are disposed together.

Keep new gameplay rules in `src/game`, and pass narrow capabilities such as `TileReader` instead of the complete mutable world container. Preserve the ordered world-generation stages and seed/version constants when changing map authoring.
