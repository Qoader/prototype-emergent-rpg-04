<script lang="ts">
  import type { GameController } from '../game/gameController';
  import { onDestroy } from 'svelte';
  import { reachable } from '../game/battle/grid';
  export let controller: GameController;
  let version = 0;
  const refresh = () => { version += 1; };
  $: void version;
  $: battle = controller.battle;
  $: player = battle?.combatants.player;
  $: goblin = battle && Object.values(battle.combatants).find((c) => c.side === 'goblin');
  $: cells = battle && player ? reachable(battle, 'player') : new Map();
  const move = (col: number, row: number) => controller.dispatchBattle({ kind: 'move', actorId: 'player', destination: { col, row }});
  const attack = () => { if (goblin) controller.dispatchBattle({ kind: 'attack', actorId: 'player', targetId: goblin.id }); };
  const endTurn = () => controller.dispatchBattle({ kind: 'end-turn', actorId: 'player' });
  // The parent owns subscription lifetime; this local subscription only
  // refreshes the derived battle snapshot while the screen is mounted.
  const unsubscribe = controller.subscribe(refresh);
  onDestroy(unsubscribe);
</script>

{#if battle}
  <section class="battle" aria-label="Tactical battle">
    <div class="battle-panel"><h1>{battle.outcome === 'victory' ? 'Victory' : battle.outcome === 'defeat' ? 'Defeat' : 'Battle'}</h1>
      <p aria-live="polite">{battle.outcome ? `You ${battle.outcome}.` : battle.activeId === 'player' ? 'Your turn' : 'Goblin turn'}</p>
      <div class="stats"><span>Player HP {player?.hp}/{player?.maxHp} · ATK {player?.attack} · AP {player?.ap} · MP {player?.mp}</span><span>Goblin HP {goblin?.hp}/{goblin?.maxHp} · ATK {goblin?.attack} · AP {goblin?.ap} · MP {goblin?.mp}</span></div>
    </div>
    <div class="grid" style={`--cols:${battle.width}`} role="grid" aria-label="Battlefield">
      {#each Array.from({ length: battle.width * battle.height }, (_, index) => index) as index (index)}
        {@const col = index % battle.width}{@const row = Math.floor(index / battle.width)}{@const occupant = Object.values(battle.combatants).find((c) => c.hp > 0 && c.position.col === col && c.position.row === row)}{@const cell = cells.get(`${col},${row}`)}
        <button class:reachable={Boolean(cell?.distance)} class:player={occupant?.side === 'player'} class:goblin={occupant?.side === 'goblin'} role="gridcell" aria-label={`${col}, ${row}${occupant ? `, ${occupant.side}` : ''}`} disabled={Boolean(battle.outcome) || battle.activeId !== 'player' || !cell?.distance} on:click={() => move(col, row)}>{occupant?.side === 'player' ? 'P' : occupant?.side === 'goblin' ? 'G' : ''}</button>
      {/each}
    </div>
    <div class="controls"><button disabled={Boolean(battle.outcome) || battle.activeId !== 'player' || !goblin || player?.ap === 0} on:click={attack}>Attack</button><button disabled={Boolean(battle.outcome) || battle.activeId !== 'player'} on:click={endTurn}>End Turn</button>{#if battle.outcome}<button on:click={() => controller.continueFromResult()}>Continue</button>{/if}</div>
    <ol class="log">{#each battle.log as event, index (index)}<li>{event.kind === 'attack' ? `${event.actorId} attacks for ${event.damage}` : event.kind === 'move' ? `${event.actorId} moves` : event.kind === 'finished' ? event.outcome : `Turn ${event.turn}`}</li>{/each}</ol>
  </section>
{/if}

<style>
  .battle { position: absolute; inset: 0; z-index: 5; display: grid; place-content: center; gap: 1rem; padding: 1rem; background: rgba(10, 16, 27, .94); color: #f5f0dc; font-family: system-ui, sans-serif; overflow: auto; }
  .battle-panel, .controls { display: flex; flex-wrap: wrap; justify-content: center; gap: .75rem; align-items: center; } h1 { margin: 0; } .stats { display: grid; gap: .25rem; width: 100%; text-align: center; }
  .grid { display: grid; grid-template-columns: repeat(var(--cols), minmax(2.8rem, 5rem)); border: 2px solid #d4b56a; } .grid button { aspect-ratio: 1; border: 1px solid #53627a; background: #263b45; color: white; font-weight: 700; font-size: 1.2rem; } .grid button.reachable { background: #315a55; } .grid button.player { background: #2b67a3; } .grid button.goblin { background: #934539; }
  button { cursor: pointer; padding: .55rem .9rem; } button:disabled { opacity: .45; cursor: default; } .log { width: min(32rem, 90vw); max-height: 7rem; overflow: auto; margin: 0 auto; }
</style>
