<script lang="ts">
  import { asset } from '$app/paths';
  import { MapContainer } from '@cii/maps/svelte';
  import type { MapConfig } from '@cii/maps';
  import Preview from '#lib/Preview.svelte';

  let displayCrs = $state('EPSG:3857');
  let activeCrs = $state('EPSG:3857');
  const config = $derived<MapConfig>({
    engine: 'leaflet',
    display: { crs: displayCrs },
    view: {
      center: { crs: 'OGC:CRS84', coordinates: [151.21, -33.87] },
      zoom: 14
    },
    controls: [
      { id: 'zoom' },
      { id: 'layer-list' },
      { id: 'scale' },
      { id: 'coords' }
    ],
    layers: [
      {
        id: 'switching-basemap',
        attribution: 'CII synthetic tile grid',
        source: {
          provider: 'wms',
          url: asset('maps/demo-wms.xml'),
          layers: 'demo',
          crs: { fromMetadata: true, policy: 'prefer-display' }
        }
      },
      {
        id: 'switching-site',
        attribution: 'CII synthetic demonstration data',
        source: {
          provider: 'inline',
          crs: {
            code: 'OGC:CRS84',
            provenance: { kind: 'declared', by: 'CII example author' }
          },
          data: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { name: 'Illustrative community site' },
                geometry: { type: 'Point', coordinates: [151.21, -33.87] }
              }
            ]
          }
        }
      }
    ]
  });
</script>

<Preview title="Runtime display CRS">
  <p>
    Pan or adjust a layer, then change the display CRS. The view and layer
    settings carry across. This synthetic WMS advertises all three displays. The
    illustrative site is at longitude 151.21, latitude −33.87.
  </p>
  <label>
    Display CRS
    <select bind:value={displayCrs}>
      <option value="EPSG:3857">Web Mercator — EPSG:3857</option>
      <option value="EPSG:4326">WGS 84 — EPSG:4326</option>
      <option value="OGC:CRS84">Longitude/latitude — OGC:CRS84</option>
    </select>
  </label>
  <p role="status">Active display: {activeCrs}</p>
  <MapContainer
    {config}
    label="Switchable demonstration"
    height="30rem"
    ondisplaycrschange={(change) => (activeCrs = change.current)}
  />
</Preview>

<style>
  label {
    display: grid;
    gap: var(--cii-space-2);
  }
  select {
    color: var(--cii-text-primary);
    background: var(--cii-bg-card);
    border: 1px solid var(--cii-border-default);
    border-radius: var(--cii-radius-input);
    padding: var(--cii-space-2);
    font: inherit;
  }
  select:focus-visible {
    outline: 3px solid var(--cii-focus-ring);
    outline-offset: 3px;
  }
</style>
