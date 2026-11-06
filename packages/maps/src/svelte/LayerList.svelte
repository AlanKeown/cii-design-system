<script lang="ts">
  import { Button } from '@cii/svelte';
  import type { MapLayerInfo } from '../map-controller.js';

  let {
    layers,
    disabled = false,
    onchange
  }: {
    layers: readonly MapLayerInfo[];
    disabled?: boolean;
    onchange: (
      id: string,
      patch: { visible?: boolean; opacity?: number; order?: number }
    ) => void;
  } = $props();
  const ordered = $derived(
    [...layers].sort((a, b) => b.order - a.order || a.id.localeCompare(b.id))
  );

  function move(id: string, direction: -1 | 1) {
    const index = ordered.findIndex((layer) => layer.id === id);
    const other = ordered[index + direction];
    if (!other) return;
    // Normalise ranks so equal or sparse application orders can also be moved.
    const next = [...ordered];
    [next[index], next[index + direction]] = [
      next[index + direction],
      next[index]
    ];
    next.forEach((layer, i) =>
      onchange(layer.id, { order: next.length - i - 1 })
    );
  }
</script>

<fieldset {disabled}>
  <legend>Layers</legend>
  <ol>
    {#each ordered as layer, index (layer.id)}
      <li>
        <label>
          <input
            type="checkbox"
            checked={layer.visible}
            onchange={(event) =>
              onchange(layer.id, { visible: event.currentTarget.checked })}
          />
          {layer.id}
        </label>
        <label class="opacity">
          Opacity for {layer.id}
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={layer.opacity}
            oninput={(event) =>
              onchange(layer.id, {
                opacity: event.currentTarget.valueAsNumber
              })}
          />
        </label>
        <div class="order">
          <Button
            variant="secondary"
            disabled={index === 0}
            aria-label={`Move ${layer.id} up`}
            onclick={() => move(layer.id, -1)}>Move up</Button
          >
          <Button
            variant="secondary"
            disabled={index === ordered.length - 1}
            aria-label={`Move ${layer.id} down`}
            onclick={() => move(layer.id, 1)}>Move down</Button
          >
        </div>
      </li>
    {/each}
  </ol>
</fieldset>

<style>
  fieldset {
    min-width: 0;
    margin: 0;
    border: 1px solid var(--cii-border-default);
    border-radius: var(--cii-radius-input);
    padding: var(--cii-space-3);
  }
  ol {
    display: grid;
    gap: var(--cii-space-3);
    padding: 0;
    list-style: none;
    margin: 0;
  }
  li {
    display: grid;
    gap: var(--cii-space-2);
  }
  .opacity {
    display: grid;
    gap: var(--cii-space-1);
  }
  .opacity input {
    width: 100%;
  }
  .order {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cii-space-2);
  }
  input {
    accent-color: var(--cii-map-feature);
  }
  input:focus-visible {
    outline: 3px solid var(--cii-focus-ring);
    outline-offset: 3px;
  }
</style>
