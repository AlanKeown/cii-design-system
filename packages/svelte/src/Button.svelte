<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  type Props = Omit<HTMLButtonAttributes, 'children'> & {
    variant?: 'primary' | 'secondary' | 'tertiary' | 'danger';
    loading?: boolean;
    children?: Snippet;
  };

  let {
    variant = 'primary',
    loading = false,
    disabled = false,
    type = 'button',
    class: className = '',
    children,
    ...rest
  }: Props = $props();
</script>

<button
  {...rest}
  {type}
  class={`cii-button ${className}`}
  data-variant={variant}
  disabled={disabled || loading}
  aria-busy={loading || undefined}
>
  {#if loading}<span class="spinner" aria-hidden="true"></span>{/if}
  {@render children?.()}
</button>

<style>
  .cii-button {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--cii-space-2);
    min-height: 40px;
    padding: 9px 16px;
    border: 1px solid var(--cii-brand-primary);
    border-radius: var(--cii-radius-button);
    background: var(--cii-brand-primary);
    color: var(--cii-text-on-action);
    font-family: var(--cii-font-family);
    font-size: var(--cii-font-body);
    line-height: var(--cii-line-body);
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    transition: background var(--cii-motion-fast);
  }
  .cii-button:hover:not(:disabled) {
    background: var(--cii-brand-primary-strong);
  }
  .cii-button[data-variant='secondary'] {
    background: var(--cii-bg-card);
    color: var(--cii-text-primary);
    border-color: var(--cii-border-default);
  }
  .cii-button[data-variant='tertiary'] {
    background: transparent;
    color: var(--cii-text-primary);
    border-color: transparent;
  }
  .cii-button:is(
      [data-variant='secondary'],
      [data-variant='tertiary']
    ):hover:not(:disabled) {
    background: var(--cii-bg-subtle);
  }
  .cii-button[data-variant='danger'] {
    background: var(--cii-text-error);
    border-color: var(--cii-text-error);
    color: var(--cii-bg-card);
  }
  .cii-button[data-variant='danger']:hover:not(:disabled) {
    filter: brightness(0.92);
  }
  .cii-button:focus-visible {
    outline: 3px solid var(--cii-focus-ring);
    outline-offset: 3px;
  }
  .cii-button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .cii-button {
      transition: none;
    }
    .spinner {
      animation: none;
    }
  }
</style>
