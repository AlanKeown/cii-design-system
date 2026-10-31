<script lang="ts">
  import { Button } from '@cii/svelte';
  import Preview from '#lib/Preview.svelte';
  let count = $state(0);
</script>

<Preview title="Button example">
  <div class="buttons">
    <Button onclick={() => count++}>Add member</Button>
    <Button variant="secondary">Cancel</Button>
    <Button variant="tertiary">View details</Button>
    <Button variant="danger">Archive member</Button>
    <Button disabled>Unavailable</Button>
    <Button loading>Saving</Button>
  </div>
  <p role="status">Members added: {count}</p>
</Preview>

<style>
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
  p {
    margin: 0;
  }
</style>
