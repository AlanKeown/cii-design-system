<script lang="ts">
  import type { Snippet } from 'svelte';
  let {
    tone = 'neutral',
    children
  }: {
    tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
    children?: Snippet;
  } = $props();
</script>

<span class="cii-chip" data-tone={tone}>{@render children?.()}</span>

<style>
  .cii-chip {
    --tone: var(--cii-text-secondary);
    display: inline-block;
    border-radius: var(--cii-radius-pill);
    padding: 4px 9px;
    font: 550 var(--cii-font-caption)/var(--cii-line-caption)
      var(--cii-font-family);
    white-space: nowrap;
    color: var(--tone);
    background: color-mix(in srgb, var(--tone) 9%, var(--cii-bg-card));
  }
  .cii-chip[data-tone='success'] {
    --tone: var(--cii-text-success);
  }
  .cii-chip[data-tone='warning'] {
    --tone: var(--cii-text-warning);
  }
  .cii-chip[data-tone='danger'] {
    --tone: var(--cii-text-error);
  }
  .cii-chip[data-tone='accent'] {
    background: var(--cii-brand-secondary-soft);
  }
</style>
