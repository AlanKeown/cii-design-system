<script lang="ts">
  import { tick } from 'svelte';
  import { Button } from '@cii/svelte';
  import type { CoordinateValue } from '../controls/readouts.js';
  let {
    value,
    oncentre
  }: { value: CoordinateValue | null; oncentre: () => void } = $props();
  let announcement = $state('');
  const warnings = $derived(value?.accuracy.warnings ?? []);
  async function announce() {
    if (!value) return;
    const accuracyNotes = warnings
      .map(
        (warning) =>
          ({
            DATUM_DIFFERENCE: 'Datums differ.',
            DATUM_UNKNOWN: 'Datum relationship is unknown.',
            DATUM_ENSEMBLE: 'Datum ensemble; realisation unspecified.',
            EPOCH_NOT_APPLIED: 'Coordinate epoch corrections are not applied.'
          })[warning.code]
      )
      .join(' ');
    const text = `${value.mode === 'pointer' ? 'Pointer' : 'Map centre'}. ${value.displayCode}: ${value.displayText}.${value.readoutCode !== value.displayCode ? ` ${value.readoutCode}: ${value.readoutText}.` : ''} Display coordinates only; survey accuracy is not established. ${accuracyNotes}`;
    announcement = '';
    await tick();
    announcement = text;
  }
</script>

<section class="coordinates" aria-label="Coordinate readout">
  <div aria-live="off">
    {#if value}
      <p class="mode">{value.mode === 'pointer' ? 'Pointer' : 'Map centre'}</p>
      <p class="note">
        Display coordinates only; survey accuracy is not established.
      </p>
      <p data-coordinate="display">
        <strong>{value.displayCode}</strong>: {value.displayText}
      </p>
      {#if value.readoutCode !== value.displayCode}
        <p data-coordinate="readout">
          <strong>{value.readoutCode}</strong>: {value.readoutText}
        </p>
      {/if}

      {#if warnings.some((warning) => warning.code === 'DATUM_DIFFERENCE')}
        <p class="warning">
          Datums differ; datum correction accuracy is unverified.
        </p>
      {/if}
      {#if warnings.some((warning) => warning.code === 'DATUM_UNKNOWN')}
        <p class="warning">Datum relationship is unknown.</p>
      {/if}
      {#if warnings.some((warning) => warning.code === 'DATUM_ENSEMBLE')}
        <p class="note">Datum ensemble: realisation unspecified.</p>
      {/if}
      {#if warnings.some((warning) => warning.code === 'EPOCH_NOT_APPLIED')}
        <p class="warning">Coordinate epoch corrections are not applied.</p>
      {/if}
    {:else}<p>Coordinates unavailable at this position.</p>{/if}
  </div>
  <div class="actions">
    <Button variant="secondary" onclick={oncentre}>Use map centre</Button>
    <Button variant="secondary" disabled={!value} onclick={announce}
      >Announce coordinates</Button
    >
  </div>
  <span class="sr-only" role="status" aria-live="polite" aria-atomic="true"
    >{announcement}</span
  >
</section>

<style>
  .coordinates {
    box-sizing: border-box;
    width: min(20rem, 100%);
    min-width: 0;
    padding: var(--cii-space-2);
    border: 1px solid var(--cii-border-default);
    border-radius: var(--cii-radius-input);
    color: var(--cii-text-primary);
    background: var(--cii-bg-card);
    overflow-wrap: anywhere;
  }
  p {
    margin: 0;
  }
  .mode {
    font-weight: 600;
  }
  .note {
    color: var(--cii-text-secondary);
  }
  .warning {
    color: var(--cii-text-warning);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cii-space-2);
    margin-top: var(--cii-space-2);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
</style>
