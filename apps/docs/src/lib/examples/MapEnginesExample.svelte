<script lang="ts">
  import { onMount } from 'svelte';
  import { MapContainer, createMapRuntime } from '@cii/maps/svelte';
  import { createCrsRegistry } from '@cii/maps';
  import type { MapConfig } from '@cii/maps';
  import type { MapRuntime } from '@cii/maps/svelte';

  let engine = $state('openlayers');
  let displayCrs = $state('EPSG:3857');
  let runtime = $state.raw<MapRuntime>();
  let failure = $state('');
  onMount(() => {
    let active = true;
    void createCrsRegistry()
      .resolve('EPSG:7856')
      .then((definition) => {
        if (!active) return;
        runtime = createMapRuntime({
          definitions: [
            {
              ...definition,
              // Example grid in metres; this does not identify a real tile service.
              tileMatrix: {
                origin: [0, 10_000_000],
                resolutions: Array.from(
                  { length: 25 },
                  (_, zoom) => 10_000_000 / 256 / 2 ** zoom
                )
              }
            }
          ]
        });
      })
      .catch(() => {
        if (active) failure = 'Map definitions could not be prepared.';
      });
    return () => {
      active = false;
    };
  });
  const config = $derived<MapConfig>({
    engine,
    display: { crs: displayCrs },
    view: {
      center: { crs: 'EPSG:7844', coordinates: [151.21, -33.87] },
      resolution: displayCrs === 'EPSG:4326' ? 0.0001 : 10
    },
    controls: [
      { id: 'zoom' },
      { id: 'layer-list' },
      { id: 'scale' },
      { id: 'coords', readoutCrs: 'EPSG:7844' }
    ],
    layers: [
      {
        id: 'example-sites',
        attribution: 'Synthetic demonstration locations',
        source: {
          provider: 'inline',
          crs: {
            code: 'EPSG:7844',
            provenance: { kind: 'declared', by: 'CII documentation example' }
          },
          data: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                id: 'harbour',
                properties: { name: 'Harbour site' },
                geometry: { type: 'Point', coordinates: [151.21, -33.87] }
              },
              {
                type: 'Feature',
                id: 'garden',
                properties: { name: 'Garden site' },
                geometry: { type: 'Point', coordinates: [151.215, -33.872] }
              }
            ]
          }
        }
      }
    ]
  });
</script>

<div class="selectors">
  <label
    >Map engine
    <select
      bind:value={engine}
      onchange={() => {
        displayCrs = 'EPSG:3857';
      }}
    >
      <option value="openlayers">OpenLayers</option>
      <option value="leaflet">Leaflet</option>
      <option value="maplibre">MapLibre</option>
    </select>
  </label>
  <label
    >Engine display CRS
    <select bind:value={displayCrs} disabled={engine === 'maplibre'}>
      <option value="EPSG:3857">Web Mercator — EPSG:3857</option>
      <option value="EPSG:7856">GDA2020 / MGA zone 56 — EPSG:7856</option>
      <option value="EPSG:4326">WGS 84 — EPSG:4326</option>
    </select>
  </label>
</div>
<p>
  Two synthetic sites: Harbour at 151.210° E, 33.870° S, and Garden at 151.215°
  E, 33.872° S (GDA2020). MapLibre uses Web Mercator.
</p>
{#if runtime}
  {#key engine}
    <MapContainer
      {config}
      {runtime}
      label="Engine comparison sites"
      description="The two locations are listed above the map."
    />
  {/key}
{:else}
  <p role="status">{failure || 'Preparing map definitions…'}</p>
{/if}

<style>
  .selectors {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cii-space-4);
    margin-block: var(--cii-space-4);
  }
  label {
    display: grid;
    gap: var(--cii-space-2);
  }
  select {
    font: inherit;
    color: var(--cii-text-primary);
    background: var(--cii-bg-card);
    border: 1px solid var(--cii-border-default);
    border-radius: var(--cii-radius-input);
    padding: var(--cii-space-2);
    max-width: 100%;
  }
  select:focus-visible {
    outline: 2px solid var(--cii-focus-ring);
    outline-offset: 2px;
  }
</style>
