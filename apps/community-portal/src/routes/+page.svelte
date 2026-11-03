<script lang="ts">
  import type { PageProps } from './$types';
  import PortalWorkspace from '#lib/components/PortalWorkspace.svelte';
  let { data }: PageProps = $props();
</script>

{#key data}<PortalWorkspace {data} />{/key}
