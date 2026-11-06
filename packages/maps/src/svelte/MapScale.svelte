<script lang="ts">
  import type { ScaleValue } from '../controls/readouts.js';
  let { value }: { value: ScaleValue | null } = $props();
</script>

<section class="scale" aria-label="Map scale" aria-live="off">
  {#if value}
    <div class="bar" style:width={`${value.width}px`} aria-hidden="true"></div>
    <p>{value.label}</p>
    <p class="note">Approximate ground distance at centre</p>
  {:else}<p>Scale unavailable at this centre.</p>{/if}
</section>

<style>
  .scale {
    width: fit-content;
    max-width: 100%;
    box-sizing: border-box;
    padding: var(--cii-space-2);
    color: var(--cii-text-primary);
    background: var(--cii-bg-card);
    border: 1px solid var(--cii-border-default);
    border-radius: var(--cii-radius-input);
  }
  .bar {
    box-sizing: border-box;
    height: 8px;
    border: 2px solid currentColor;
    border-top: 0;
  }
  p {
    margin: 0;
  }
  .note {
    font-size: var(--cii-font-caption);
    max-width: 8rem;
  }
</style>
