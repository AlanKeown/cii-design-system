<script lang="ts">
  import { Alert } from '@cii/svelte';
  import type { MapError } from '../errors.js';
  import { mapErrorMessage, mapErrorIssues } from './error-message.js';

  let { error, title }: { error: MapError; title: string } = $props();
  const issues = $derived(mapErrorIssues(error));
</script>

<Alert tone="danger" role="alert" {title}>
  <p>{mapErrorMessage(error)}</p>
  {#if issues.length}
    <ul>
      {#each issues as issue, index (index)}
        <li>
          <code>{issue.path}</code>: {issue.message}
          {issue.action ?? 'Update this setting to meet the requirement above.'}
        </li>
      {/each}
    </ul>
  {/if}
</Alert>

<style>
  p {
    margin: 0;
  }
  ul {
    margin: var(--cii-space-2) 0 0;
    padding-left: var(--cii-space-6);
  }
  code {
    overflow-wrap: anywhere;
  }
</style>
