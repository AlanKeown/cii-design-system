<script lang="ts">
  import { onMount } from 'svelte';
  import { Alert, Button } from '@cii/svelte';
  import type { PageProps } from './$types';
  let { form }: PageProps = $props();
  onMount(() => {
    if (form?.error) document.getElementById('confirm-error')?.focus();
  });
</script>

<svelte:head
  ><title>Confirm sign-in · Common Ground</title><meta
    name="referrer"
    content="strict-origin"
  /></svelte:head
>
<main class="auth-panel">
  <h1>Confirm your sign-in</h1>
  <p>
    Choose Continue to use this email link. Opening this page alone does not
    sign you in.
  </p>
  {#if form?.error}<div id="confirm-error" tabindex="-1">
      <Alert tone="danger" role="alert">{form.error}</Alert>
    </div>{/if}
  <form method="POST"><Button type="submit">Continue</Button></form>
  <a href="/auth">Request a new sign-in email</a>
</main>
