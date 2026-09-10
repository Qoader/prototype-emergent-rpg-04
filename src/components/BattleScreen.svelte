<script lang="ts">
  /* global PointerEvent, ResizeObserver */
  import type { GameSnapshot, GameController } from '../game/gameController';
  import { onMount, tick } from 'svelte';
  import { createBattleRuntime } from '../game/battleRuntime';
  import { reachable } from '../game/battle/grid';
  import {
    BATTLE_RENDER_PADDING,
    BATTLE_TILE_SIZE,
    battleSurfacePixelSize,
    clampBattleCameraAxis,
    revealBattleCameraAxis
  } from '../game/battleRendering';
  import type { Point } from '../game/types';
  import { canAttack } from '../game/battle/legality';
  export let battle: GameSnapshot['battle'];
  export let battleBusy: boolean;
  export let battleNotice: GameSnapshot['battleNotice'];
  export let dispatch: GameController['dispatchBattle'];
  export let continueFromResult: GameController['continueFromResult'];
  let battleHost: HTMLElement;
  let continueButton: globalThis.HTMLButtonElement;
  let lastOutcome: string | null = null;
  let battleRuntime: ReturnType<typeof createBattleRuntime> | undefined;
  let battleArtState: 'loading' | 'ready' | 'failed' = 'loading';
  let cameraX = 0;
  let cameraY = 0;
  let boardViewport: HTMLElement;
  let gesture: 'idle' | 'pressed' | 'dragging' = 'idle';
  let suppressClick = false;
  let pointerId = -1;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;
  let hoveredCost: number | undefined;
  let keyboardFocus: Point | null = null;
  $: boardWidth = battle ? battle.width * BATTLE_TILE_SIZE : BATTLE_TILE_SIZE * 10;
  $: boardHeight = battle ? battle.height * BATTLE_TILE_SIZE : BATTLE_TILE_SIZE * 10;
  $: surface = battle
    ? battleSurfacePixelSize(battle)
    : { width: boardWidth + BATTLE_RENDER_PADDING * 2, height: boardHeight + BATTLE_RENDER_PADDING * 2 };
  $: surfaceWidth = surface.width;
  $: surfaceHeight = surface.height;
  const clampCamera = () => {
    if (!boardViewport) return;
    const w = boardViewport.clientWidth;
    const h = boardViewport.clientHeight;
    cameraX = clampBattleCameraAxis(cameraX, w, surfaceWidth);
    cameraY = clampBattleCameraAxis(cameraY, h, surfaceHeight);
  };
  const centerCombatants = () => {
    if (!battle || !boardViewport) return;
    const actors = Object.values(battle.combatants).filter((c) => c.hp > 0);
    if (actors.length) {
      const left = Math.min(...actors.map((c) => c.position.col));
      const right = Math.max(...actors.map((c) => c.position.col + 1));
      const top = Math.min(...actors.map((c) => c.position.row));
      const bottom = Math.max(...actors.map((c) => c.position.row + 1));
      const col = (left + right) / 2;
      const row = (top + bottom) / 2;
      cameraX = boardViewport.clientWidth / 2 - (BATTLE_RENDER_PADDING + col * BATTLE_TILE_SIZE);
      cameraY = boardViewport.clientHeight / 2 - (BATTLE_RENDER_PADDING + row * BATTLE_TILE_SIZE);
    }
    clampCamera();
  };
  const pointerStart = (event: PointerEvent) => {
    if (gesture !== 'idle' || event.button !== 0 || !event.isPrimary) return;
    pointerId = event.pointerId;
    gesture = 'pressed';
    suppressClick = false;
    startX = event.clientX;
    startY = event.clientY;
    originX = cameraX;
    originY = cameraY;
  };
  const pointerMove = (event: PointerEvent) => {
    if (event.pointerId !== pointerId || gesture === 'idle') return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (gesture === 'pressed' && dx * dx + dy * dy < 36) return;
    if (gesture === 'pressed') {
      gesture = 'dragging';
      boardViewport.setPointerCapture(pointerId);
    }
    cameraX = originX + dx;
    cameraY = originY + dy;
    clampCamera();
  };
  const pointerEnd = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    const wasDragging = gesture === 'dragging';
    const activePointer = pointerId;
    gesture = 'idle';
    pointerId = -1;
    suppressClick = wasDragging;
    if (boardViewport.hasPointerCapture(activePointer))
      boardViewport.releasePointerCapture(activePointer);
  };
  const pointerCaptureLost = (event: PointerEvent) => {
    // Capture loss bubbles. A tile can lose its implicit touch capture when
    // the viewport takes ownership after the drag threshold is crossed; that
    // transition must not end the active gesture.
    if (event.target !== boardViewport) return;
    pointerEnd(event);
  };
  const revealFocus = (index: number) => {
    if (!battle || !boardViewport) return;
    const col = index % battle.width;
    const row = Math.floor(index / battle.width);
    const w = boardViewport.clientWidth;
    const h = boardViewport.clientHeight;
    const targetLeft = Math.max(0, BATTLE_RENDER_PADDING + col * BATTLE_TILE_SIZE - BATTLE_RENDER_PADDING);
    const targetRight = Math.min(surfaceWidth, BATTLE_RENDER_PADDING + (col + 1) * BATTLE_TILE_SIZE + BATTLE_RENDER_PADDING);
    const targetTop = Math.max(0, BATTLE_RENDER_PADDING + row * BATTLE_TILE_SIZE - BATTLE_RENDER_PADDING);
    const targetBottom = Math.min(surfaceHeight, BATTLE_RENDER_PADDING + (row + 1) * BATTLE_TILE_SIZE + BATTLE_RENDER_PADDING);
    cameraX = revealBattleCameraAxis(cameraX, w, surfaceWidth, targetLeft, targetRight);
    cameraY = revealBattleCameraAxis(cameraY, h, surfaceHeight, targetTop, targetBottom);
  };
  let focusIndex = 0;
  let lastActiveId: string | undefined;
  let cellRefs: globalThis.HTMLButtonElement[] = [];
  onMount(() => {
    let mounted = true;
    void tick().then(() => {
      if (!mounted || !battle) return;
      const active = battle.combatants[battle.activeId];
      focusIndex = active ? active.position.row * battle.width + active.position.col : 0;
      lastActiveId = battle.activeId;
      centerCombatants();
      cellRefs[focusIndex]?.focus({ preventScroll: true });
    });
    return () => {
      mounted = false;
    };
  });
  $: if (
    battle &&
    boardViewport &&
    lastActiveId !== undefined &&
    battle.activeId !== lastActiveId
  ) {
    lastActiveId = battle.activeId;
    const active = battle.combatants[battle.activeId];
    if (active) revealFocus(active.position.row * battle.width + active.position.col);
  }
  onMount(() => {
    let previousWidth = 0;
    let previousHeight = 0;
    const observer = new ResizeObserver(() => {
      if (!boardViewport) return;
      const w = boardViewport.clientWidth;
      const h = boardViewport.clientHeight;
      const centerX = previousWidth / 2 - cameraX;
      const centerY = previousHeight / 2 - cameraY;
      cameraX = w / 2 - centerX;
      cameraY = h / 2 - centerY;
      clampCamera();
      previousWidth = w;
      previousHeight = h;
    });
    if (boardViewport) {
      previousWidth = boardViewport.clientWidth;
      previousHeight = boardViewport.clientHeight;
      observer.observe(boardViewport);
    }
    return () => observer.disconnect();
  });
  const gridKey = (event: globalThis.KeyboardEvent, index: number, col: number, row: number) => {
    if (!battle) return;
    let next = index;
    if (event.key === 'ArrowUp') next = Math.max(0, index - battle.width);
    else if (event.key === 'ArrowDown')
      next = Math.min(battle.width * battle.height - 1, index + battle.width);
    else if (event.key === 'ArrowLeft') next = index % battle.width ? index - 1 : index;
    else if (event.key === 'ArrowRight')
      next = index % battle.width < battle.width - 1 ? index + 1 : index;
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      cellClick(
        Object.values(battle.combatants).find(
          (c) => c.hp > 0 && c.position.col === col && c.position.row === row
        ),
        col,
        row,
        Boolean(cells.get(`${col},${row}`)?.distance),
        false
      );
      return;
    } else return;
    event.preventDefault();
    focusIndex = next;
    revealFocus(next);
    const buttons = (event.currentTarget as HTMLElement).parentElement?.querySelectorAll('button');
    (buttons?.[next] as globalThis.HTMLButtonElement | undefined)?.focus({ preventScroll: true });
  };
  onMount(() => {
    const runtime = createBattleRuntime(battleHost, {
      onReady: () => {
        battleArtState = 'ready';
      },
      onError: () => {
        battleArtState = 'failed';
      }
    });
    battleRuntime = runtime;
    // init handles its own rejection as a nonfatal progressive-enhancement
    // failure; this observer also protects the component if that policy changes.
    void runtime.init.catch(() => {
      battleArtState = 'failed';
    });
    return () => {
      runtime.destroy();
      if (battleRuntime === runtime) battleRuntime = undefined;
    };
  });
  $: player = battle?.combatants.player;
  $: goblin = battle && Object.values(battle.combatants).find((c) => c.side === 'goblin');
  $: cells = battle && player ? reachable(battle, 'player') : new Map();
  const move = (col: number, row: number) =>
    dispatch({ kind: 'move', actorId: 'player', destination: { col, row } });
  const attack = () => {
    if (goblin && battle && canAttack(battle, 'player', goblin.id))
      dispatch({ kind: 'attack', actorId: 'player', targetId: goblin.id });
  };
  $: canAct = Boolean(
    battle &&
    !battle.outcome &&
    battle.activeId === 'player' &&
    !battleBusy &&
    !battle.visual?.[battle.activeId]?.moving
  );
  $: attackReady = Boolean(battle && goblin && canAct && canAttack(battle, 'player', goblin.id));
  $: movementTargets = canAct ? [...cells.values()].filter((cell) => cell.distance > 0).map((cell) => cell.point) : [];
  $: attackTargets = canAct && battle
    ? Object.values(battle.combatants).filter((combatant) => combatant.side === 'goblin' && canAttack(battle, 'player', combatant.id)).map((combatant) => combatant.position)
    : [];
  $: movementTargetKeys = new Set(movementTargets.map((point) => `${point.col},${point.row}`));
  $: attackTargetKeys = new Set(attackTargets.map((point) => `${point.col},${point.row}`));
  $: if (battle && battleRuntime) battleRuntime.update(battle, { movementTargets, attackTargets, keyboardFocus });
  $: if (battle?.outcome && battle.outcome !== lastOutcome) {
    lastOutcome = battle.outcome;
    void tick().then(() => continueButton?.focus());
  }
  $: if (!battle?.outcome) lastOutcome = null;
  const cellClick = (
    occupant: { side: string } | undefined,
    col: number,
    row: number,
    reachableCell: boolean,
    pointerActivation = true
  ) => {
    if (pointerActivation && suppressClick) {
      suppressClick = false;
      return;
    }
    if (!canAct) return;
    if (occupant?.side === 'goblin') {
      attack();
      return;
    }
    if (reachableCell) move(col, row);
  };
  const endTurn = () => {
    if (canAct) dispatch({ kind: 'end-turn', actorId: 'player' });
  };
</script>

{#if battle}
  <section class="battle" aria-label="Tactical battle">
    <header class="battle-header">
      <div>
        <p class="eyebrow">TACTICAL ENCOUNTER</p>
        <h1>
          {battle.outcome === 'victory'
            ? 'Victory'
            : battle.outcome === 'defeat'
              ? 'Defeat'
              : 'Battle'}
        </h1>
      </div>
      <p class="turn">
        {battle.outcome
          ? `You ${battle.outcome}.`
          : battle.activeId === 'player'
            ? 'Your turn'
            : 'Goblin turn'}
      </p>
      <div class="stats">
        <span
          >Player HP {player?.hp}/{player?.maxHp} · ATK {player?.attack} · AP {player?.ap} · MP {player?.mp}</span
        ><span
          >Goblin HP {goblin?.hp}/{goblin?.maxHp} · ATK {goblin?.attack} · AP {goblin?.ap} · MP {goblin?.mp}</span
        >
      </div>
    </header>
    <div class="battle-board-wrap">
      <button class="center-button" on:click={centerCombatants}>Center</button>
      <div
        role="presentation"
        class="battle-board"
        class:ready={battleArtState === 'ready'}
        bind:this={boardViewport}
        on:pointerdown={pointerStart}
        on:pointermove={pointerMove}
        on:pointerup={pointerEnd}
        on:pointercancel={pointerEnd}
        on:lostpointercapture={pointerCaptureLost}
      >
        <div
          class="board-content"
          style={`width:${surfaceWidth}px;height:${surfaceHeight}px;transform:translate(${cameraX}px,${cameraY}px)`}
        >
          <div class="battle-art" bind:this={battleHost} aria-hidden="true"></div>
          <div
            class="grid"
            style={`--cols:${battle.width};--rows:${battle.height};width:${boardWidth}px;height:${boardHeight}px`}
            role="grid"
            aria-label="Battlefield"
            aria-busy={battleBusy}
          >
            {#each Array.from({ length: battle.width * battle.height }, (_, index) => index) as index (index)}
              {@const col = index % battle.width}{@const row = Math.floor(
                index / battle.width
              )}{@const occupant = Object.values(battle.combatants).find(
                (c) => c.hp > 0 && c.position.col === col && c.position.row === row
              )}{@const cell = cells.get(`${col},${row}`)}
              <button
                bind:this={cellRefs[index]}
                tabindex={index === focusIndex ? 0 : -1}
                on:mouseenter={() => {
                  hoveredCost = cell?.distance;
                }}
                on:mouseleave={() => {
                  hoveredCost = undefined;
                }}
                on:focus={(event) => {
                  hoveredCost = cell?.distance;
                  // Pointer activation also focuses a button; only expose the
                  // canvas focus marker when the browser considers it keyboard-visible.
                  keyboardFocus = (event.currentTarget as HTMLElement).matches(':focus-visible')
                    ? { col, row }
                    : null;
                }}
                on:blur={() => {
                  hoveredCost = undefined;
                  keyboardFocus = null;
                }}
                on:keydown={(event) => gridKey(event, index, col, row)}
                class:reachable={movementTargetKeys.has(`${col},${row}`)}
                class:attackable={attackTargetKeys.has(`${col},${row}`)}
                class:focused={keyboardFocus?.col === col && keyboardFocus?.row === row}
                role="gridcell"
                aria-label={`${col}, ${row}${occupant ? `, ${occupant.side}` : ''}`}
                aria-describedby={cell?.distance ? `move-cost-${index}` : undefined}
                aria-disabled={!canAct ||
                  (occupant?.side !== 'goblin' && occupant?.side !== 'player' && !cell?.distance)}
                on:click={() => cellClick(occupant, col, row, Boolean(cell?.distance), true)}
                >{#if cell?.distance}<span id={`move-cost-${index}`} class="sr-only"
                    >Move cost {cell.distance} MP</span
                  >{/if}{#if battleArtState !== 'ready'}{occupant?.side === 'player'
                    ? 'P'
                    : occupant?.side === 'goblin'
                      ? 'G'
                      : ''}{/if}</button
              >
            {/each}
          </div>
        </div>
      </div>
    </div>
    <footer class="battle-footer">
      <div class="log" role="status" aria-live="polite" aria-atomic="true">
        {battleNotice?.message ?? ''}
      </div>
      <p class="guidance">
        {battle.outcome
          ? 'Continue to return to the world.'
          : hoveredCost
            ? `Move here · cost ${hoveredCost} MP`
            : canAct
              ? 'Choose a highlighted tile or an action.'
              : 'Waiting for the battlefield…'}
      </p>
      <div class="controls">
        {#if !battle.outcome}
          <button class="primary" disabled={!attackReady} on:click={attack}>Attack</button><button
            class="secondary"
            disabled={!canAct}
            on:click={endTurn}>End Turn</button
          >{:else}<button
            bind:this={continueButton}
            class="primary continue"
            on:click={continueFromResult}>Continue</button
          >{/if}
      </div>
    </footer>
  </section>
{/if}

<style>
  .battle {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 0.75rem;
    padding: clamp(0.65rem, 2vw, 1.25rem);
    background: rgba(10, 32, 27, 0.97);
    color: #f6efd9;
    font-family: Georgia, serif;
    overflow: hidden;
  }
  .battle-art {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 0;
    image-rendering: pixelated;
  }
  .battle-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 12rem);
    gap: 0.2rem 1rem;
    align-items: center;
    max-width: 60rem;
    width: 100%;
    margin: auto;
  }
  .eyebrow {
    margin: 0;
    color: #d6b867;
    font: 600 0.7rem system-ui;
    letter-spacing: 0.16em;
  }
  h1 {
    margin: 0;
    font-size: clamp(1.35rem, 4vw, 2rem);
    font-weight: 500;
  }
  .turn {
    margin: 0;
    color: #e2c77c;
    font-size: 1.1rem;
  }
  .stats {
    grid-column: 1/-1;
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    color: #c9d0bc;
    font: 0.75rem system-ui;
    white-space: nowrap;
  }
  .battle-board-wrap {
    min-height: 0;
    position: relative;
    display: grid;
    place-items: center;
  }
  .battle-board {
    width: min(92vw, 640px);
    height: 100%;
    max-height: 640px;
    overflow: hidden;
    touch-action: none;
    position: relative;
    border: 1px solid #ad8c47;
    box-shadow: 0 0 0 4px #183c31;
  }
  .center-button {
    position: absolute;
    z-index: 3;
    right: 0.5rem;
    top: 0.5rem;
    background: #143d31;
    color: #f6efd9;
    border: 1px solid #d6b867;
    border-radius: 3px;
    padding: 0.45rem 0.7rem;
    font: 0.75rem system-ui;
  }
  .board-content {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: top left;
  }
  .board-content::after {
    content: '';
    position: absolute;
    inset: 8px;
    border: 2px solid #d4b56a;
    pointer-events: none;
    z-index: 2;
  }
  .battle-board.ready .board-content::after { display: none; }
  .grid {
    position: absolute;
    left: 8px;
    top: 8px;
    z-index: 1;
    display: grid;
    grid-template-columns: repeat(var(--cols), 48px);
    grid-template-rows: repeat(var(--rows), 48px);
  }
  .grid button {
    width: 48px;
    height: 48px;
    border: 1px solid #536b58;
    background: #263b35;
    color: #fff;
    font-weight: 700;
    font-size: 1.2rem;
  }
  .battle-board.ready .grid button {
    background: transparent;
    border-color: transparent;
    outline: none;
    box-shadow: none;
  }
  .battle-board:not(.ready) .grid button.reachable {
    box-shadow: inset 0 0 0 2px #57b86b;
  }
  .battle-board:not(.ready) .grid button.attackable {
    box-shadow: inset 0 0 0 2px #e36559;
  }
  .battle-board:not(.ready) .grid button.focused {
    outline: 2px solid #fff;
    outline-offset: -6px;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .battle-footer {
    width: 100%;
    max-width: 60rem;
    margin: auto;
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 0.4rem 1rem;
  }
  .log {
    min-height: 1.5rem;
    color: #f9e3a2;
    font-size: 1rem;
  }
  .guidance {
    margin: 0;
    color: #aeb9a4;
    font: 0.76rem system-ui;
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.6rem;
    grid-row: 1/3;
    grid-column: 2;
  }
  button {
    min-height: 48px;
    cursor: pointer;
    padding: 0.65rem 1.1rem;
    border-radius: 4px;
    font: 600 0.9rem system-ui;
  }
  button.primary {
    background: #d6b867;
    color: #172c25;
    border: 2px solid #e5ca7b;
  }
  button.secondary {
    background: transparent;
    color: #f6efd9;
    border: 2px solid #d6b867;
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  button:focus-visible {
    outline: 3px solid #fff;
    outline-offset: 2px;
  }
  @media (max-width: 600px) {
    .battle {
      padding: 0.6rem;
      gap: 0.5rem;
    }
    .stats {
      font-size: 0.65rem;
      overflow: hidden;
    }
    .battle-footer {
      grid-template-columns: 1fr;
    }
    .controls {
      grid-column: 1;
      grid-row: auto;
      justify-content: stretch;
    }
    .controls button {
      flex: 1;
    }
    .guidance {
      display: none;
    }
    .battle-board {
      width: 100%;
    }
    .center-button {
      top: 0.35rem;
      right: 0.35rem;
    }
  }
  @media (max-height: 440px) and (orientation: landscape) {
    .battle {
      grid-template-columns: 1fr auto;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 0.5rem;
    }
    .battle-header {
      grid-column: 1/-1;
    }
    .battle-board-wrap {
      grid-column: 1;
    }
    .battle-footer {
      grid-column: 2;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      width: 100%;
    }
    .controls {
      display: flex;
      flex-direction: column;
      width: 100%;
    }
    .battle-board {
      max-height: none;
    }
    .stats {
      font-size: 0.65rem;
    }
  }
</style>
