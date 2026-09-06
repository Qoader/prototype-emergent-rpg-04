<script lang="ts">
  import type { GameSnapshot, GameController } from '../game/gameController';
  import { onMount, tick } from 'svelte';
  import { createBattleRuntime } from '../game/battleRuntime';
  import { reachable } from '../game/battle/grid';
  export let battle: GameSnapshot['battle'];
  export let dispatch: GameController['dispatchBattle'];
  export let continueFromResult: GameController['continueFromResult'];
  let battleHost: HTMLElement;
  let battleRuntime: ReturnType<typeof createBattleRuntime> | undefined;
  let focusIndex = 0; let cellRefs: globalThis.HTMLButtonElement[] = [];
  onMount(() => { void tick().then(() => { if (battle) { const active = battle.combatants[battle.activeId]; focusIndex = active ? active.position.row * battle.width + active.position.col : 0; cellRefs[focusIndex]?.focus(); } }); });
  const gridKey = (event: globalThis.KeyboardEvent, index: number, col: number, row: number) => { if (!battle) return; let next = index; if (event.key === 'ArrowUp') next = Math.max(0, index - battle.width); else if (event.key === 'ArrowDown') next = Math.min(battle.width * battle.height - 1, index + battle.width); else if (event.key === 'ArrowLeft') next = index % battle.width ? index - 1 : index; else if (event.key === 'ArrowRight') next = index % battle.width < battle.width - 1 ? index + 1 : index; else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); const occupant = Object.values(battle.combatants).find((c) => c.hp > 0 && c.position.col === col && c.position.row === row); if (occupant?.side === 'goblin') attack(); else move(col, row); return; } else return; event.preventDefault(); focusIndex = next; const buttons = (event.currentTarget as HTMLElement).parentElement?.querySelectorAll('button'); (buttons?.[next] as globalThis.HTMLButtonElement | undefined)?.focus(); };
  onMount(() => { battleRuntime = createBattleRuntime(battleHost); void battleRuntime.init.then(() => { if (battle) battleRuntime?.update(battle); }); return () => battleRuntime?.destroy(); });
  $: if (battle && battleRuntime) battleRuntime.update(battle);
  $: player = battle?.combatants.player;
  $: goblin = battle && Object.values(battle.combatants).find((c) => c.side === 'goblin');
  $: cells = battle && player ? reachable(battle, 'player') : new Map();
  const move = (col: number, row: number) => dispatch({ kind: 'move', actorId: 'player', destination: { col, row }});
  const attack = () => { if (goblin) dispatch({ kind: 'attack', actorId: 'player', targetId: goblin.id }); };
  const cellClick = (occupant: { side: string } | undefined, col: number, row: number, reachableCell: boolean) => { if (!battle || battle.outcome || battle.activeId !== 'player') return; if (occupant?.side === 'goblin') { attack(); return; } if (reachableCell) move(col, row); };
  const endTurn = () => dispatch({ kind: 'end-turn', actorId: 'player' });
</script>

{#if battle}
  <section class="battle" aria-label="Tactical battle">
    <div class="battle-art" bind:this={battleHost} aria-hidden="true"></div>
    <div class="battle-panel"><h1>{battle.outcome === 'victory' ? 'Victory' : battle.outcome === 'defeat' ? 'Defeat' : 'Battle'}</h1>
      <p aria-live="polite">{battle.outcome ? `You ${battle.outcome}.` : battle.activeId === 'player' ? 'Your turn' : 'Goblin turn'}</p>
      <div class="stats"><span>Player HP {player?.hp}/{player?.maxHp} · ATK {player?.attack} · AP {player?.ap} · MP {player?.mp}</span><span>Goblin HP {goblin?.hp}/{goblin?.maxHp} · ATK {goblin?.attack} · AP {goblin?.ap} · MP {goblin?.mp}</span></div>
    </div>
    <div class="grid" style={`--cols:${battle.width}`} role="grid" aria-label="Battlefield">
      {#each Array.from({ length: battle.width * battle.height }, (_, index) => index) as index (index)}
        {@const col = index % battle.width}{@const row = Math.floor(index / battle.width)}{@const occupant = Object.values(battle.combatants).find((c) => c.hp > 0 && c.position.col === col && c.position.row === row)}{@const cell = cells.get(`${col},${row}`)}
        <button bind:this={cellRefs[index]} tabindex={index === focusIndex ? 0 : -1} on:keydown={(event) => gridKey(event, index, col, row)} class:reachable={Boolean(cell?.distance)} class:attackable={Boolean(occupant?.side === 'goblin' && player && Math.abs(player.position.col-col)+Math.abs(player.position.row-row)===1)} class:player={occupant?.side === 'player'} class:goblin={occupant?.side === 'goblin'} role="gridcell" aria-label={`${col}, ${row}${occupant ? `, ${occupant.side}` : ''}`} aria-disabled={Boolean(battle.outcome) || battle.activeId !== 'player' || (occupant?.side !== 'goblin' && occupant?.side !== 'player' && !cell?.distance)} on:click={() => cellClick(occupant, col, row, Boolean(cell?.distance))}>{occupant?.side === 'player' ? 'P' : occupant?.side === 'goblin' ? 'G' : ''}</button>
      {/each}
    </div>
    <div class="controls"><button disabled={Boolean(battle.outcome) || battle.activeId !== 'player' || !goblin || player?.ap === 0 || !goblin || Math.abs((player?.position.col ?? 0)-goblin.position.col)+Math.abs((player?.position.row ?? 0)-goblin.position.row)!==1} on:click={attack}>Attack</button><button disabled={Boolean(battle.outcome) || battle.activeId !== 'player'} on:click={endTurn}>End Turn</button>{#if battle.outcome}<button on:click={continueFromResult}>Continue</button>{/if}</div>
    <ol class="log">{#each battle.log as event, index (index)}<li>{event.kind === 'attack' ? `${event.actorId} attacks for ${event.damage}` : event.kind === 'move' ? `${event.actorId} moves` : event.kind === 'finished' ? event.outcome : `Turn ${event.turn}`}</li>{/each}</ol>
  </section>
{/if}

<style>
  .battle { position: absolute; inset: 0; z-index: 5; display: grid; place-content: center; gap: 1rem; padding: 1rem; background: rgba(10, 16, 27, .94); color: #f5f0dc; font-family: system-ui, sans-serif; overflow: auto; } .battle-art { position: absolute; inset: 0; pointer-events: none; }
  .battle-panel, .controls { display: flex; flex-wrap: wrap; justify-content: center; gap: .75rem; align-items: center; } h1 { margin: 0; } .stats { display: grid; gap: .25rem; width: 100%; text-align: center; }
  .grid { display: grid; width: min(92vw, 35rem); grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); border: 2px solid #d4b56a; } .grid button { aspect-ratio: 1; border: 1px solid #53627a; background: #263b45; color: white; font-weight: 700; font-size: 1.2rem; } .grid button.reachable { background: #315a55; } .grid button.attackable { outline: 3px solid #f8d36b; } .grid button.player { background: #2b67a3; } .grid button.goblin { background: #934539; }
  button { cursor: pointer; padding: .55rem .9rem; } button:disabled { opacity: .45; cursor: default; } .log { width: min(32rem, 90vw); max-height: 7rem; overflow: auto; margin: 0 auto; }
</style>
