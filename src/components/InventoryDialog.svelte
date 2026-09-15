<script lang="ts">
  import { tick } from 'svelte';
  import { ITEM_CATALOG } from '../game/inventory/catalog';
  import { kilograms } from '../game/inventory/rules';
  import type { InventorySnapshot, ItemId, InventoryResult } from '../game/inventory/types';
  import ItemIcon from './ItemIcon.svelte';
  let {
    open,
    inventory,
    onClose,
    onDrop,
    dropsEnabled
  }: {
    open: boolean;
    inventory: InventorySnapshot;
    onClose: () => void;
    onDrop: (id: ItemId, quantity: number) => InventoryResult;
    dropsEnabled: boolean;
  } = $props();
  let dialog: globalThis.HTMLDialogElement;
  let selected = $state<ItemId | null>(null);
  let quantity = $state(1);
  let error = $state('');
  let prior: HTMLElement | null = null;
  $effect(() => {
    if (open) {
      prior = document.activeElement as HTMLElement;
      void tick().then(() => dialog?.showModal());
    } else if (dialog?.open) {
      dialog.close();
      prior?.focus();
    }
  });
  const choose = (id: ItemId) => {
    selected = id;
    quantity = 1;
    error = '';
  };
  const close = () => onClose();
  const stack = () => inventory.stacks.find((s) => s.id === selected);
</script>

<dialog
  bind:this={dialog}
  class="inventory-dialog"
  aria-label="Inventory"
  onclose={close}
  onclick={(event) => {
    if (event.target === dialog) close();
  }}
>
  <div class="inventory-panel">
    <header>
      <h2>Inventory</h2>
      <span>{kilograms(inventory.weightGrams)} / {kilograms(inventory.capacityGrams)}</span><button
        type="button"
        aria-label="Close inventory"
        onclick={close}>×</button
      >
    </header>
    <div class="inventory-grid" aria-label="Carried items">
      {#each inventory.stacks as item (item.id)}<button
          type="button"
          aria-label={`${ITEM_CATALOG[item.id].name}, quantity ${item.quantity}`}
          class:selected={selected === item.id}
          onclick={() => choose(item.id)}
          ><ItemIcon id={item.id} /><span>{item.quantity}</span></button
        >{/each}
    </div>
    {#if selected && stack()}{@const current = stack()!}
      <section class="item-details">
        <h3>{ITEM_CATALOG[selected].name}</h3>
        <p>{ITEM_CATALOG[selected].description}</p>
        <p>
          {kilograms(ITEM_CATALOG[selected].weightGrams)} each · {kilograms(
            ITEM_CATALOG[selected].weightGrams * current.quantity
          )} stack
        </p>
        <div>
          <label
            >Quantity <input
              aria-label="Drop quantity"
              type="number"
              min="1"
              max={current.quantity}
              bind:value={quantity}
            /></label
          ><button type="button" onclick={() => (quantity = 1)}>One</button><button
            type="button"
            onclick={() => (quantity = current.quantity)}>All</button
          ><button
            type="button"
            disabled={!dropsEnabled}
            onclick={() => {
              const value = Number(quantity);
              if (!Number.isInteger(value) || value < 1 || value > current.quantity)
                error = 'Enter a whole quantity available in this stack.';
              else {
                const result = onDrop(selected!, value);
                error = result.ok ? '' : result.error.replace('-', ' ');
              }
            }}>Drop</button
          >
          {#if error}<p role="alert">{error}</p>{/if}
        </div>
      </section>
    {:else}<p class="item-details">Select an item to inspect it.</p>{/if}
  </div>
</dialog>
