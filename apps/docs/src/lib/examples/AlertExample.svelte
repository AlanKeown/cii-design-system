<script lang="ts">
  import { Alert, Button } from '@cii/svelte';
  import Preview from '#lib/Preview.svelte';
  let show = $state(false);
</script>

<Preview title="Alert example">
  <Alert title="Before you begin"
    >Have the member’s contact details ready.</Alert
  >
  <Alert tone="warning" title="Review these details"
    >The member may already have a record.</Alert
  >
  <Alert tone="danger" title="Couldn’t save changes"
    >Check the required fields and try again.</Alert
  >
  <Button onclick={() => (show = !show)}
    >{show ? 'Reset example' : 'Show success message'}</Button
  >
  {#if show}<Alert tone="success" role="status" title="Changes saved"
      >The member record is up to date.</Alert
    >{/if}
</Preview>
