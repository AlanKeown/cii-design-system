<script lang="ts">
  import { onMount } from 'svelte';
  import { Alert, Button, TextField } from '@cii/svelte';
  import type { PageProps } from './$types';
  let { data, form }: PageProps = $props();
  onMount(() => {
    if (form?.error || data.callbackError)
      document.getElementById('auth-error')?.focus();
  });
</script>

<svelte:head>
  <title>Sign in · Common Ground</title>
  {#if data.siteKey}<script
      lang="ts"
      src="https://challenges.cloudflare.com/turnstile/v0/api.js"
      async
      defer
    ></script>{/if}
</svelte:head>
<main class="auth-panel">
  <h1>Sign in to Common Ground</h1>
  <p>
    {#if data.configured}Sign in to save a demo workspace to your account, or
      try the browser-only demo without an account.
    {:else}Try the demo without an account. Changes are saved only in this
      browser.{/if}
  </p>
  <p>
    This is a public demo. Use fictional information only. Do not enter real
    people’s names, contact details or case notes. Inactive demo organisations
    are deleted after 30 days. <a href="/privacy">Privacy and retention</a>
  </p>
  {#if form?.error || data.callbackError}<div id="auth-error" tabindex="-1">
      <Alert tone="danger" role="alert"
        >{form?.error ??
          'Sign-in could not be completed. Please try again.'}</Alert
      >
    </div>{/if}
  {#if form?.sent}<Alert
      >Check your email for a six-digit code or a sign-in link.</Alert
    >{/if}
  {#if data.configured}
    <form method="POST" action="?/send">
      <TextField
        id="send-email"
        label="Email address"
        name="email"
        type="email"
        autocomplete="email"
        required
        maxlength={254}
        value={form?.email ?? ''}
      />
      {#if data.siteKey}<div
          class="cf-turnstile"
          data-sitekey={data.siteKey}
        ></div>{/if}
      <Button type="submit">Send sign-in email</Button>
    </form>
    <form method="POST" action="?/verify">
      <TextField
        id="verify-email"
        label="Email address for code"
        name="email"
        type="email"
        autocomplete="email"
        required
        maxlength={254}
        value={form?.email ?? ''}
      />
      <TextField
        id="code"
        label="Six-digit code"
        name="code"
        autocomplete="one-time-code"
        inputmode="numeric"
        pattern={'[0-9]{6}'}
        minlength={6}
        maxlength={6}
        required
      />
      <Button type="submit">Verify code</Button>
    </form>
    {#if data.github}<form method="POST" action="?/github">
        <Button type="submit">Continue with GitHub</Button>
      </form>{/if}
  {:else}<p>Account sign-in is not configured on this deployment.</p>{/if}
  <form method="POST" action="?/local">
    <Button type="submit">Try without an account</Button>
  </form>
  <a href="/">Back to workspace</a>
</main>
