<script lang="ts">
  /* global PointerEvent, ResizeObserver */
  import type { GameSnapshot, GameController } from '../game/gameController';
  import { onMount, tick } from 'svelte';
  import { createBattleRuntime } from '../game/battleRuntime';
  import { reachable } from '../game/battle/grid';
  import { BATTLE_TILE_SIZE } from '../game/battleRendering';
  export let battle: GameSnapshot['battle'];
  export let battleBusy: boolean;
  export let dispatch: GameController['dispatchBattle'];
  export let continueFromResult: GameController['continueFromResult'];
  let battleHost: HTMLElement;
  let battleRuntime: ReturnType<typeof createBattleRuntime> | undefined;
  let battleArtState: 'loading' | 'ready' | 'failed' = 'loading';
  let cameraX = 0; let cameraY = 0; let boardViewport: HTMLElement; let gesture: 'idle' | 'pressed' | 'dragging' = 'idle'; let suppressClick = false; let pointerId = -1; let startX = 0; let startY = 0; let originX = 0; let originY = 0;
  $: boardWidth = battle ? battle.width * BATTLE_TILE_SIZE : BATTLE_TILE_SIZE * 10;
  $: boardHeight = battle ? battle.height * BATTLE_TILE_SIZE : BATTLE_TILE_SIZE * 10;
  const clampCamera = () => { if (!boardViewport) return; const w = boardViewport.clientWidth; const h = boardViewport.clientHeight; cameraX = w >= boardWidth ? (w - boardWidth) / 2 : Math.max(w - boardWidth, Math.min(0, cameraX)); cameraY = h >= boardHeight ? (h - boardHeight) / 2 : Math.max(h - boardHeight, Math.min(0, cameraY)); };
  const centerCombatants = () => { if (!battle || !boardViewport) return; const actors = Object.values(battle.combatants).filter((c) => c.hp > 0); if (actors.length) { const col = actors.reduce((sum, c) => sum + c.position.col + .5, 0) / actors.length; const row = actors.reduce((sum, c) => sum + c.position.row + .5, 0) / actors.length; cameraX = boardViewport.clientWidth / 2 - col * BATTLE_TILE_SIZE; cameraY = boardViewport.clientHeight / 2 - row * BATTLE_TILE_SIZE; } clampCamera(); };
  const pointerStart = (event: PointerEvent) => { if (event.button !== 0 || !event.isPrimary) return; pointerId = event.pointerId; gesture = 'pressed'; suppressClick = false; startX = event.clientX; startY = event.clientY; originX = cameraX; originY = cameraY; };
  const pointerMove = (event: PointerEvent) => { if (event.pointerId !== pointerId || gesture === 'idle') return; const dx = event.clientX - startX; const dy = event.clientY - startY; if (gesture === 'pressed' && dx * dx + dy * dy < 36) return; if (gesture === 'pressed') { gesture = 'dragging'; boardViewport.setPointerCapture(pointerId); } cameraX = originX + dx; cameraY = originY + dy; clampCamera(); };
  const pointerEnd = (event: PointerEvent) => { if (event.pointerId !== pointerId) return; const wasDragging = gesture === 'dragging'; gesture = 'idle'; pointerId = -1; suppressClick = wasDragging; if (boardViewport.hasPointerCapture(event.pointerId)) boardViewport.releasePointerCapture(event.pointerId); };
  const revealFocus = (index: number) => { if (!battle || !boardViewport) return; const col = index % battle.width; const row = Math.floor(index / battle.width); const w = boardViewport.clientWidth; const h = boardViewport.clientHeight; const left = -cameraX; const top = -cameraY; if (col * BATTLE_TILE_SIZE < left) cameraX = Math.min(0, -col * BATTLE_TILE_SIZE); else if ((col + 1) * BATTLE_TILE_SIZE > left + w) cameraX = Math.max(w - boardWidth, -(col + 1) * BATTLE_TILE_SIZE + w); if (row * BATTLE_TILE_SIZE < top) cameraY = Math.min(0, -row * BATTLE_TILE_SIZE); else if ((row + 1) * BATTLE_TILE_SIZE > top + h) cameraY = Math.max(h - boardHeight, -(row + 1) * BATTLE_TILE_SIZE + h); clampCamera(); };
  let focusIndex = 0; let cellRefs: globalThis.HTMLButtonElement[] = [];
  onMount(() => {
    let mounted = true;
    void tick().then(() => {
      if (!mounted || !battle) return;
      const active = battle.combatants[battle.activeId];
      focusIndex = active ? active.position.row * battle.width + active.position.col : 0;
      centerCombatants(); cellRefs[focusIndex]?.focus({ preventScroll: true });
    });
    return () => { mounted = false; };
  });
  onMount(() => { let centerX = 240; let centerY = 240; const observer = new ResizeObserver(() => { if (!boardViewport) return; const w = boardViewport.clientWidth; const h = boardViewport.clientHeight; cameraX = w / 2 - centerX; cameraY = h / 2 - centerY; clampCamera(); centerX = -cameraX + w / 2; centerY = -cameraY + h / 2; }); if (boardViewport) { centerX = -cameraX + boardViewport.clientWidth / 2; centerY = -cameraY + boardViewport.clientHeight / 2; observer.observe(boardViewport); } return () => observer.disconnect(); });
  const gridKey = (event: globalThis.KeyboardEvent, index: number, col: number, row: number) => { if (!battle) return; let next = index; if (event.key === 'ArrowUp') next = Math.max(0, index - battle.width); else if (event.key === 'ArrowDown') next = Math.min(battle.width * battle.height - 1, index + battle.width); else if (event.key === 'ArrowLeft') next = index % battle.width ? index - 1 : index; else if (event.key === 'ArrowRight') next = index % battle.width < battle.width - 1 ? index + 1 : index; else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); cellClick(Object.values(battle.combatants).find((c) => c.hp > 0 && c.position.col === col && c.position.row === row), col, row, Boolean(cells.get(`${col},${row}`)?.distance)); return; } else return; event.preventDefault(); focusIndex = next; revealFocus(next); const buttons = (event.currentTarget as HTMLElement).parentElement?.querySelectorAll('button'); (buttons?.[next] as globalThis.HTMLButtonElement | undefined)?.focus({ preventScroll: true }); };
  onMount(() => {
    const runtime = createBattleRuntime(battleHost, { onReady: () => { battleArtState = 'ready'; }, onError: () => { battleArtState = 'failed'; } });
    battleRuntime = runtime;
    // init handles its own rejection as a nonfatal progressive-enhancement
    // failure; this observer also protects the component if that policy changes.
    void runtime.init.catch(() => { battleArtState = 'failed'; });
    return () => {
      runtime.destroy();
      if (battleRuntime === runtime) battleRuntime = undefined;
    };
  });
  $: if (battle && battleRuntime) battleRuntime.update(battle);
  $: player = battle?.combatants.player;
  $: goblin = battle && Object.values(battle.combatants).find((c) => c.side === 'goblin');
  $: cells = battle && player ? reachable(battle, 'player') : new Map();
  const move = (col: number, row: number) => dispatch({ kind: 'move', actorId: 'player', destination: { col, row }});
  const attack = () => { if (goblin) dispatch({ kind: 'attack', actorId: 'player', targetId: goblin.id }); };
  $: canAct = Boolean(battle && !battle.outcome && battle.activeId === 'player' && !battleBusy && !battle.visual?.[battle.activeId]?.moving);
  const cellClick = (occupant: { side: string } | undefined, col: number, row: number, reachableCell: boolean) => { if (suppressClick) { suppressClick = false; return; } if (!canAct) return; if (occupant?.side === 'goblin') { attack(); return; } if (reachableCell) move(col, row); };
  const endTurn = () => { if (canAct) dispatch({ kind: 'end-turn', actorId: 'player' }); };
</script>

{#if battle}
  <section class="battle" aria-label="Tactical battle">
    <div class="battle-panel"><h1>{battle.outcome === 'victory' ? 'Victory' : battle.outcome === 'defeat' ? 'Defeat' : 'Battle'}</h1>
      <p aria-live="polite">{battle.outcome ? `You ${battle.outcome}.` : battle.activeId === 'player' ? 'Your turn' : 'Goblin turn'}</p>
      <div class="stats"><span>Player HP {player?.hp}/{player?.maxHp} · ATK {player?.attack} · AP {player?.ap} · MP {player?.mp}</span><span>Goblin HP {goblin?.hp}/{goblin?.maxHp} · ATK {goblin?.attack} · AP {goblin?.ap} · MP {goblin?.mp}</span></div>
    </div>
    <div role="presentation" class="battle-board" class:ready={battleArtState === 'ready'} bind:this={boardViewport} on:pointerdown={pointerStart} on:pointermove={pointerMove} on:pointerup={pointerEnd} on:pointercancel={pointerEnd} on:lostpointercapture={pointerEnd}>
    <div class="board-content" style={`width:${boardWidth}px;height:${boardHeight}px;transform:translate(${cameraX}px,${cameraY}px)`}>
    <div class="battle-art" bind:this={battleHost} aria-hidden="true"></div>
    <div class="grid" style={`--cols:${battle.width};--rows:${battle.height};width:${boardWidth}px;height:${boardHeight}px`} role="grid" aria-label="Battlefield" aria-busy={battleBusy}>
      {#each Array.from({ length: battle.width * battle.height }, (_, index) => index) as index (index)}
        {@const col = index % battle.width}{@const row = Math.floor(index / battle.width)}{@const occupant = Object.values(battle.combatants).find((c) => c.hp > 0 && c.position.col === col && c.position.row === row)}{@const cell = cells.get(`${col},${row}`)}
        <button bind:this={cellRefs[index]} tabindex={index === focusIndex ? 0 : -1} on:keydown={(event) => gridKey(event, index, col, row)} class:reachable={Boolean(cell?.distance)} class:attackable={Boolean(occupant?.side === 'goblin' && player && Math.abs(player.position.col-col)+Math.abs(player.position.row-row)===1)} class:player={occupant?.side === 'player'} class:goblin={occupant?.side === 'goblin'} role="gridcell" aria-label={`${col}, ${row}${occupant ? `, ${occupant.side}` : ''}`} aria-disabled={!canAct || (occupant?.side !== 'goblin' && occupant?.side !== 'player' && !cell?.distance)} on:click={() => cellClick(occupant, col, row, Boolean(cell?.distance))}>{#if battleArtState !== 'ready'}{occupant?.side === 'player' ? 'P' : occupant?.side === 'goblin' ? 'G' : ''}{/if}</button>
      {/each}
    </div></div></div>
    <div class="controls"><button disabled={battleBusy || Boolean(battle.visual?.[battle.activeId]?.moving) || !goblin || player?.ap === 0 || Math.abs((player?.position.col ?? 0)-goblin.position.col)+Math.abs((player?.position.row ?? 0)-goblin.position.row)!==1} on:click={attack}>Attack</button><button disabled={battleBusy || Boolean(battle.visual?.[battle.activeId]?.moving) || Boolean(battle.outcome) || battle.activeId !== 'player'} on:click={endTurn}>End Turn</button>{#if battle.outcome}<button on:click={continueFromResult}>Continue</button>{/if}</div>
    <ol class="log">{#each battle.log as event, index (index)}<li>{event.kind === 'attack' ? `${event.actorId} attacks for ${event.damage}` : event.kind === 'move' ? `${event.actorId} moves` : event.kind === 'finished' ? event.outcome : `Turn ${event.turn}`}</li>{/each}</ol>
  </section>
{/if}

<style>
  .battle { position: absolute; inset: 0; z-index: 5; display: grid; place-content: center; gap: 1rem; padding: 1rem; background: rgba(10, 16, 27, .94); color: #f5f0dc; font-family: system-ui, sans-serif; overflow: auto; } .battle-art { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0; }
  .battle-panel, .controls { display: flex; flex-wrap: wrap; justify-content: center; gap: .75rem; align-items: center; } h1 { margin: 0; } .stats { display: grid; gap: .25rem; width: 100%; text-align: center; }
  .battle-board { width: min(92vw, 480px); height: min(70vh, 480px); overflow: hidden; touch-action: none; position: relative; } .board-content { position: absolute; top: 0; left: 0; transform-origin: top left; } .board-content::after { content: ''; position: absolute; inset: 0; border: 2px solid #d4b56a; pointer-events: none; z-index: 2; } .grid { position: absolute; inset: 0; z-index: 1; display: grid; grid-template-columns: repeat(var(--cols), 48px); grid-template-rows: repeat(var(--rows), 48px); transform-origin: top left; } .grid button { width: 48px; height: 48px; border: 1px solid #53627a; background: #263b45; color: white; font-weight: 700; font-size: 1.2rem; } .battle-board.ready .grid button { background: rgba(38, 59, 69, .08); } .battle-board.ready .grid button.reachable { background: rgba(49, 90, 85, .2); } .battle-board.ready .grid button.player { background: rgba(43, 103, 163, .25); } .battle-board.ready .grid button.goblin { background: rgba(147, 69, 57, .25); } .grid button.attackable { outline: 3px solid #f8d36b; }
  button { cursor: pointer; padding: .55rem .9rem; } button:disabled { opacity: .45; cursor: default; } .log { width: min(32rem, 90vw); max-height: 7rem; overflow: auto; margin: 0 auto; }
</style>
