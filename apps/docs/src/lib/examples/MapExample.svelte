<script lang="ts">
  import { asset } from '$app/paths';
  import { MapContainer } from '@cii/maps/svelte';
  import { Button } from '@cii/svelte';
  import type { MapConfig, SourceConfig } from '@cii/maps';
  import Preview from '#lib/Preview.svelte';
  let visible = $state(true);
  let readoutCrs = $state('OGC:CRS84');
  let basemap = $state<'xyz' | 'wms' | 'wmts'>('xyz');
  const basemapSource = $derived<SourceConfig>(
    basemap === 'xyz'
      ? {
          provider: 'xyz',
          url: `${asset('maps/demo-tile.svg')}?z={z}&x={x}&y={y}`,
          crs: {
            code: 'EPSG:3857',
            provenance: { kind: 'declared', by: 'CII example author' }
          }
        }
      : basemap === 'wms'
        ? {
            provider: 'wms',
            url: asset('maps/demo-wms.xml'),
            layers: 'demo',
            crs: { fromMetadata: true, policy: 'prefer-display' }
          }
        : {
            provider: 'wmts',
            url: asset('maps/demo-wmts.xml'),
            layer: 'demo',
            matrixSet: 'web',
            crs: { fromMetadata: true, policy: 'prefer-display' }
          }
  );
  let mounted = $state(true);
  let large = $state(false);
  const sites = [
    { name: 'Harbour community hub', coordinates: [151.207, -33.863] },
    { name: 'Neighbourhood garden', coordinates: [151.216, -33.873] },
    { name: 'Volunteer meeting point', coordinates: [151.201, -33.877] }
  ];
  const config = $derived<MapConfig>({
    engine: 'leaflet',
    controls: [
      { id: 'zoom' },
      { id: 'layer-list' },
      { id: 'scale' },
      { id: 'coords', readoutCrs }
    ],
    view: {
      center: { crs: 'OGC:CRS84', coordinates: [151.21, -33.87] },
      zoom: 14
    },
    layers: [
      {
        id: 'demonstration-basemap',
        order: 0,
        attribution: 'CII synthetic tile grid — not geographic reference data',
        source: basemapSource
      },
      {
        id: 'demonstration-sites',
        order: 1,
        visible,
        attribution: 'CII synthetic demonstration data',
        source: {
          provider: 'inline',
          crs: {
            code: 'EPSG:7844',
            provenance: { kind: 'declared', by: 'CII example author' }
          },
          data: {
            type: 'FeatureCollection',
            features: sites.map((site, id) => ({
              type: 'Feature',
              id,
              properties: { name: site.name },
              geometry: { type: 'Point', coordinates: site.coordinates }
            }))
          }
        },
        style: {
          point: { shape: 'circle', size: large ? 24 : 12 },
          stroke: { color: 'token:--cii-map-feature', width: 3 },
          fill: { color: 'token:--cii-map-feature', opacity: 0.35 }
        }
      }
    ]
  });
</script>

<Preview title="Community map">
  <p>
    Illustrative sites near Sydney. The locations and repeating basemap grid are
    synthetic. Tiles are served locally; the grid does not represent streets or
    boundaries. Select XYZ, WMS or WMTS to try the providers, then use Layers to
    change visibility, opacity and stacking order.
  </p>
  <label class="provider">
    Basemap service
    <select bind:value={basemap}>
      <option value="xyz">XYZ tiles</option>
      <option value="wms">WMS 1.3.0</option>
      <option value="wmts">WMTS 1.0.0</option>
    </select>
  </label>
  <label class="provider">
    Readout CRS
    <select bind:value={readoutCrs}>
      <option value="OGC:CRS84">Longitude/latitude — OGC:CRS84</option>
      <option value="EPSG:7856">GDA2020 / MGA zone 56 — EPSG:7856</option>
      <option value="EPSG:3857">Web Mercator — EPSG:3857</option>
    </select>
  </label>
  <div class="actions">
    <Button
      variant="secondary"
      aria-pressed={visible}
      onclick={() => (visible = !visible)}
      >{visible ? 'Hide sites' : 'Show sites'}</Button
    >
    <Button
      variant="secondary"
      aria-pressed={large}
      onclick={() => (large = !large)}>Larger markers</Button
    >
    <Button variant="secondary" onclick={() => (mounted = !mounted)}
      >{mounted ? 'Unmount map' : 'Mount map'}</Button
    >
  </div>
  {#if mounted}<MapContainer
      {config}
      height="36rem"
      label="Community demonstration"
      description="Three illustrative community locations. Use the list below as a text alternative."
    />{/if}
  <section aria-label="Demonstration locations">
    <h3>Locations</h3>
    <ul>
      {#each sites as site (site.name)}<li>
          {site.name} · longitude {site.coordinates[0]}, latitude {site
            .coordinates[1]}
        </li>{/each}
    </ul>
  </section>
</Preview>

<style>
  .provider {
    display: grid;
    gap: var(--cii-space-2);
    margin-block: var(--cii-space-3);
  }
  .provider select {
    color: var(--cii-text-primary);
    background: var(--cii-bg-card);
    border: 1px solid var(--cii-border-default);
    border-radius: var(--cii-radius-input);
    padding: var(--cii-space-2);
    font: inherit;
  }
  .provider select:focus-visible {
    outline: 3px solid var(--cii-focus-ring);
    outline-offset: 3px;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cii-space-2);
  }
</style>
