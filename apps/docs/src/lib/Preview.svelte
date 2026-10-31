<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  let { title, children }: { title: string; children: Snippet } = $props();
  let dark = $state(false);
  let ready = $state(false);
  onMount(() => {
    ready = true;
  });
</script>

<section
  class="cii-preview not-prose"
  data-cii-theme={dark ? 'dark' : 'light'}
  data-ready={ready}
  aria-label={title}
>
  <div class="preview-heading">
    <span>{title}</span>
    <button type="button" aria-pressed={dark} onclick={() => (dark = !dark)}
      >Dark preview</button
    >
  </div>
  <div class="preview-content">{@render children()}</div>
</section>

<style>
  .cii-preview {
    overflow: hidden;
    margin: 24px 0;
    border: 1px solid var(--cii-border-default);
    border-radius: var(--cii-radius-card);
    background: var(--cii-bg-card);
    color: var(--cii-text-primary);
    font: var(--cii-font-body)/var(--cii-line-body) var(--cii-font-family);
  }
  .preview-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 20px;
    border-bottom: 1px solid var(--cii-border-default);
    background: var(--cii-bg-subtle);
    font-size: 12px;
    font-weight: 600;
  }
  .preview-heading button {
    border: 1px solid var(--cii-border-default);
    border-radius: 8px;
    padding: 6px 10px;
    background: var(--cii-bg-card);
    color: var(--cii-text-primary);
    cursor: pointer;
    font: inherit;
  }
  .preview-heading button:focus-visible {
    outline: 3px solid var(--cii-focus-ring);
    outline-offset: 3px;
  }
  .preview-content {
    padding: 24px;
    display: grid;
    gap: 16px;
  }
</style>
