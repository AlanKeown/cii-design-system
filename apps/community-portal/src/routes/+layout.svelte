<script lang="ts">
  import '@cii/tokens/tokens.css';
  import '#lib/styles.css';
  import { Button } from '@cii/svelte';
  import type { LayoutProps } from './$types';
  let { children, data }: LayoutProps = $props();
</script>

{#if data.identity}
  <header class="auth-header">
    <span>Signed in as {data.identity.email ?? data.identity.id}</span>
    <form method="POST" action="/auth/signout">
      <Button type="submit">Sign out</Button>
    </form>
  </header>
  {#if data.workspaceRoute}
    <main class="auth-panel">
      <h1>You’re signed in</h1>
      <p>
        Your account workspace will be available in Phase 4. No account records
        are loaded or saved yet.
      </p>
    </main>
  {:else}{@render children()}{/if}
{:else}
  {#if data.configured && data.authMode === 'local'}<header class="auth-header">
      Browser-only demo · changes stay on this device. <a href="/auth"
        >Sign in</a
      >
    </header>{/if}
  {@render children()}
{/if}
