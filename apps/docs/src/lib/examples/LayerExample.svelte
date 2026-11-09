<script lang="ts">
  import { onMount } from 'svelte';
  import { Layer, MapContainer, createMapRuntime } from '@cii/maps/svelte';
  import { resolveSourceCrs } from '@cii/maps';
  import type { LayerSpec, MapConfig } from '@cii/maps';
  const runtime = createMapRuntime();
  let spec = $state.raw<LayerSpec>();
  let included = $state(true);
  let opacity = $state(1);
  let large = $state(false);
  let failure = $state('');
  const config: MapConfig = {
    engine: 'leaflet',
    view: {
      center: { crs: 'OGC:CRS84', coordinates: [151.21, -33.87] },
      zoom: 14
    },
    controls: [{ id: 'zoom' }, { id: 'layer-list' }],
    layers: []
  };
  onMount(() => {
    const abort = new AbortController();
    void (async () => {
      const input = {
        provider: 'inline',
        crs: {
          code: 'OGC:CRS84',
          axisOrder: 'xy' as const,
          provenance: { kind: 'declared' as const, by: 'CII documentation' }
        },
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              id: 'harbour',
              properties: { name: 'Harbour site' },
              geometry: { type: 'Point', coordinates: [151.21, -33.87] }
            }
          ]
        }
      };
      const confirmed = await resolveSourceCrs(input, {
        sources: runtime.sources,
        crsRegistry: runtime.crs,
        displayCrs: 'EPSG:3857',
        signal: abort.signal
      });
      if (!confirmed.ok) throw confirmed.error;
      const source = await runtime.sources
        .require('inline')
        .open(input, confirmed.value, { signal: abort.signal });
      abort.signal.throwIfAborted();
      spec = {
        id: 'declarative-site',
        source,
        attribution: 'Synthetic demonstration location'
      };
    })().catch(() => {
      if (!abort.signal.aborted)
        failure = 'The example source could not be prepared.';
    });
    return () => abort.abort();
  });
</script>

<div class="actions">
  <button
    onclick={() => {
      included = !included;
    }}>{included ? 'Remove child layer' : 'Add child layer'}</button
  >
  <button
    onclick={() => {
      large = !large;
    }}>Change child point size</button
  >
  <label
    >Child layer opacity
    <input type="range" min="0" max="1" step="0.1" bind:value={opacity} />
  </label>
</div>
<p>
  Harbour site is a synthetic point at 151.210° E, 33.870° S (WGS 84). Removing
  the child releases its registration; the map remains mounted.
</p>
{#if failure}<p role="alert">{failure}</p>{/if}
<MapContainer
  {config}
  {runtime}
  label="Declarative layer example"
  description="The single site is listed above the map."
>
  {#if included && spec}
    <Layer
      {spec}
      {opacity}
      style={{ point: { shape: 'circle', size: large ? 24 : 12 } }}
    />
  {/if}
</MapContainer>

<style>
  .actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--cii-space-3);
    margin-block: var(--cii-space-3);
  }
  label {
    display: grid;
    gap: var(--cii-space-2);
  }
  button {
    font: inherit;
    color: var(--cii-text-primary);
    background: var(--cii-bg-card);
    border: 1px solid var(--cii-border-default);
    border-radius: var(--cii-radius-input);
    padding: var(--cii-space-2) var(--cii-space-3);
  }
  button:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--cii-focus-ring);
    outline-offset: 2px;
  }
</style>
