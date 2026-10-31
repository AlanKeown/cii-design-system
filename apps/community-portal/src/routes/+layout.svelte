<script lang="ts">
  import '@cii/tokens/tokens.css';
  import '#lib/styles.css';
  import type { Snippet } from 'svelte';
  let { children }: { children: Snippet } = $props();
</script>

{@render children()}
