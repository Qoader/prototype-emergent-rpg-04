<script lang="ts">
  let { onInventory, disabled = false }: { onInventory: () => void; disabled?: boolean } = $props();
  let open = $state(false);
</script>

<div class="game-menu">
  {#if open}<div class="game-menu-popover">
      <button
        type="button"
        onclick={() => {
          open = false;
          onInventory();
        }}
        {disabled}>Inventory</button
      >
    </div>{/if}
  <button
    class="round-menu"
    type="button"
    aria-label="Game menu"
    aria-expanded={open}
    onclick={() => (open = !open)}>☰</button
  >
</div>
