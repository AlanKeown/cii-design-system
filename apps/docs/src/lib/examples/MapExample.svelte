<script lang="ts">
  import { MapContainer } from '@cii/maps/svelte';
  import { Button } from '@cii/svelte';
  import type { MapConfig } from '@cii/maps';
  import Preview from '#lib/Preview.svelte';
  let visible = $state(true);
  let mounted = $state(true);
  let large = $state(false);
  const sites = [
    { name: 'Harbour community hub', coordinates: [151.207, -33.863] },
    { name: 'Neighbourhood garden', coordinates: [151.216, -33.873] },
    { name: 'Volunteer meeting point', coordinates: [151.201, -33.877] }
  ];
  const config = $derived<MapConfig>({
    engine: 'leaflet',
    view: {
      center: { crs: 'OGC:CRS84', coordinates: [151.21, -33.87] },
      zoom: 14
    },
    layers: [
      {
        id: 'demonstration-sites',
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
    Illustrative sites near Sydney. These locations are synthetic; no external
    basemap or tile service is used.
  </p>
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
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cii-space-2);
  }
</style>
