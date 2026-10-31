<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';

  type Props = Omit<
    HTMLInputAttributes,
    'id' | 'value' | 'type' | 'children'
  > & {
    id: string;
    label: string;
    value?: string;
    hint?: string;
    error?: string;
    type?: 'text' | 'email' | 'tel' | 'url' | 'search' | 'password';
  };

  let {
    id,
    label,
    value = $bindable(''),
    type = 'text',
    hint,
    error,
    required = false,
    class: className = '',
    'aria-describedby': describedBy,
    ...rest
  }: Props = $props();
  const description = $derived(
    [describedBy, hint ? `${id}-hint` : '', error ? `${id}-error` : '']
      .filter(Boolean)
      .join(' ') || undefined
  );
</script>

<div class={`cii-field ${className}`}>
  <label for={id}
    >{label}{#if required}<span aria-hidden="true"> *</span>{/if}</label
  >
  {#if hint}<p id={`${id}-hint`} class="hint">{hint}</p>{/if}
  <input
    {...rest}
    {id}
    {type}
    {required}
    bind:value
    aria-invalid={error ? 'true' : undefined}
    aria-describedby={description}
  />
  {#if error}<p id={`${id}-error`} class="error">{error}</p>{/if}
</div>

<style>
  .cii-field {
    display: grid;
    gap: 6px;
    min-width: 0;
    font: var(--cii-font-body)/var(--cii-line-body) var(--cii-font-family);
    color: var(--cii-text-primary);
  }
  label {
    display: block;
    font-size: var(--cii-font-label);
    line-height: var(--cii-line-label);
    font-weight: 600;
    margin: 0;
  }
  input {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    min-height: 42px;
    padding: 10px 12px;
    font: inherit;
    border: 1px solid var(--cii-border-default);
    border-radius: var(--cii-radius-input);
    color: var(--cii-text-primary);
    background: var(--cii-bg-card);
  }
  input:focus-visible {
    outline: 3px solid var(--cii-focus-ring);
    outline-offset: 3px;
  }
  input[aria-invalid='true'] {
    border-color: var(--cii-text-error);
  }
  input:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  p {
    margin: 0;
    font-size: var(--cii-font-label);
    line-height: var(--cii-line-label);
  }
  .hint {
    color: var(--cii-text-secondary);
  }
  .error {
    color: var(--cii-text-error);
  }
</style>
