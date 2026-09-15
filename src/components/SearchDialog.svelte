<script lang="ts">
  import { tick } from 'svelte';
  import ItemIcon from './ItemIcon.svelte';
  import { ITEM_CATALOG } from '../game/inventory/catalog';
  import { searchResultMessage, type InteractionState } from '../game/interactions';
  import type { InventoryResult, ItemId } from '../game/inventory/types';

  let {
    interaction,
    menuPosition,
    onSearch,
    onClose,
    onTake
  }: {
    interaction: InteractionState;
    menuPosition: { left: number; top: number };
    onSearch: () => boolean;
    onClose: () => boolean;
    onTake: (id: ItemId, quantity: number) => InventoryResult;
  } = $props();
  let dialog: globalThis.HTMLDialogElement;
  let error = $state('');
  let quantities = $state<Record<string, number>>({});
  let autoClosing = false;
  const take = (id: ItemId, available: number, quantity: number) => {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > available) {
      error = 'Choose a whole quantity that was found.';
      return;
    }
    const result = onTake(id, quantity);
    error = result.ok
      ? ''
      : result.error === 'over-capacity'
        ? 'That quantity will not fit in your inventory.'
        : result.error.replace('-', ' ');
  };
  $effect(() => {
    if (interaction.kind === 'results')
      void tick().then(() => {
        if (!dialog?.open) dialog?.showModal();
      });
    else if (dialog?.open) {
      autoClosing = true;
      dialog.close();
    }
  });
  const handleClose = () => {
    if (autoClosing) {
      autoClosing = false;
      return;
    }
    onClose();
  };
  $effect(() => {
    if (interaction.kind !== 'menu') return;
    const dismissOutside = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (!(target instanceof globalThis.Element)) return;
      if (target.closest('.tile-actions-menu') || target.closest('canvas')) return;
      onClose();
    };
    const timer = setTimeout(() => window.addEventListener('pointerdown', dismissOutside));
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', dismissOutside);
    };
  });
</script>

{#if interaction.kind === 'menu'}
  <div
    class="tile-actions-menu"
    data-testid="tile-actions-menu"
    role="menu"
    style:left={`${menuPosition.left}px`}
    style:top={`${menuPosition.top}px`}
  >
    <button type="button" role="menuitem" onclick={onSearch}>Search</button>
    <button type="button" role="menuitem" onclick={() => onClose()}>Close</button>
  </div>
{/if}
<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Escape' && interaction.kind === 'menu') onClose();
  }}
/>
<dialog bind:this={dialog} class="search-dialog" aria-label="Tile actions" onclose={handleClose}>
  {#if interaction.kind === 'results'}
    <section>
      <header>
        <h2>Search results</h2>
        <button type="button" aria-label="Close search" onclick={() => onClose()}>×</button>
      </header>
      {#if interaction.found.length}
        {#each interaction.found as stack (stack.id)}
          <div class="found-item">
            <span><ItemIcon id={stack.id} /> {ITEM_CATALOG[stack.id].name} × {stack.quantity}</span
            ><label
              >Quantity <input
                aria-label={`${ITEM_CATALOG[stack.id].name} quantity`}
                type="number"
                min="1"
                max={stack.quantity}
                value={quantities[stack.id] ?? stack.quantity}
                oninput={(event) => (quantities[stack.id] = Number(event.currentTarget.value))}
              /></label
            ><button
              type="button"
              onclick={() => take(stack.id, stack.quantity, quantities[stack.id] ?? stack.quantity)}
              >Take</button
            ><button
              type="button"
              onclick={() => {
                take(stack.id, stack.quantity, 1);
              }}>Take one</button
            ><button
              type="button"
              onclick={() => {
                take(stack.id, stack.quantity, stack.quantity);
              }}>Take all</button
            >
          </div>
        {/each}
      {:else}<p>{searchResultMessage(interaction)}</p>{/if}
      {#if error}<p role="alert">{error}</p>{/if}
      <footer>
        <button type="button" onclick={onSearch}>Search again</button><button
          type="button"
          onclick={() => onClose()}>Close</button
        >
      </footer>
    </section>
  {/if}
</dialog>
