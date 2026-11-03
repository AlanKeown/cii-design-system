<script lang="ts">
  import { onMount } from 'svelte';
  import { Alert, Button } from '@cii/svelte';
  import type { PageProps } from './$types';
  let { form }: PageProps = $props();
  onMount(() => {
    if (form?.error) document.getElementById('invite-error')?.focus();
  });
</script>

<svelte:head
  ><title>Join an organisation · Common Ground</title><meta
    name="referrer"
    content="strict-origin"
  /></svelte:head
>
<main class="auth-panel">
  <h1>Join an organisation</h1>
  <p>
    Accept this invitation using the email address it was sent to. This is a
    demo: use fictional information only.
  </p>
  {#if form?.error}<div id="invite-error" tabindex="-1">
      <Alert tone="danger" role="alert">{form.error}</Alert>
    </div>{/if}
  <form method="POST"><Button type="submit">Accept invitation</Button></form>
  <a href="/">Back to workspace</a>
</main>
