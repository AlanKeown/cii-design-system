<script lang="ts">
  import { onMount } from 'svelte';
  import { getMapContext } from '../../../src/svelte/index.ts';
  const map = getMapContext();
  onMount(() => {
    const original = () => map.layers?.get('child');
    let first: ReturnType<typeof original>;
    window.layerProbe = {
      manager: () => map.layers,
      same: () => {
        const current = original();
        if (!first) first = current;
        return current === first;
      }
    };
    return () => {
      delete window.layerProbe;
    };
  });
</script>
