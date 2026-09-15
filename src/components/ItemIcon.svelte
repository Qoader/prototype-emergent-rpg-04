<script lang="ts">
  import type { ItemId } from '../game/inventory/types';
  let { id }: { id: ItemId } = $props();
</script>

<svg class="item-icon" aria-hidden="true" viewBox="0 0 24 24"
  ><path
    d={id === 'ration'
      ? 'M4 9h16v10H4zM6 6h12v3H6z'
      : id === 'bandage'
        ? 'M4 8h16v8H4zM10 5h4v14h-4z'
        : id === 'rope'
          ? 'M5 12a7 7 0 1 0 14 0a7 7 0 1 0-14 0M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0'
          : 'M5 19l2-11 7-4 5 6-3 9z'}
    fill="none"
    stroke="currentColor"
    stroke-width="2"
  /></svg
>
