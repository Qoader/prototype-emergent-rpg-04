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
