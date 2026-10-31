<script lang="ts">
  import type { Snippet } from 'svelte';
  let {
    tone = 'info',
    title,
    children,
    role,
    class: className = ''
  }: {
    tone?: 'info' | 'success' | 'warning' | 'danger';
    title?: string;
    children?: Snippet;
    role?: 'alert' | 'status';
    class?: string;
  } = $props();
</script>

<div class={`cii-alert ${className}`} data-tone={tone} {role}>
  {#if title}<strong>{title}</strong>{/if}
  <div>{@render children?.()}</div>
</div>

<style>
  .cii-alert {
    --tone: var(--cii-text-info);
    box-sizing: border-box;
    padding: var(--cii-space-4);
    border: 1px solid var(--tone);
    border-left-width: 4px;
    border-radius: var(--cii-radius-input);
    color: var(--cii-text-primary);
    background: color-mix(in srgb, var(--tone) 7%, var(--cii-bg-card));
    font: var(--cii-font-body)/var(--cii-line-body) var(--cii-font-family);
  }
  .cii-alert[data-tone='success'] {
    --tone: var(--cii-text-success);
  }
  .cii-alert[data-tone='warning'] {
    --tone: var(--cii-text-warning);
  }
  .cii-alert[data-tone='danger'] {
    --tone: var(--cii-text-error);
  }
  strong {
    display: block;
    color: var(--tone);
    margin-bottom: var(--cii-space-2);
    font-weight: 700;
  }
</style>
