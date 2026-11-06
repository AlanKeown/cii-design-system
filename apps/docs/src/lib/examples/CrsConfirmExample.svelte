<script lang="ts">
  import { asset } from '$app/paths';
  import {
    CrsConfirm,
    MapContainer,
    createLeafletRuntime
  } from '@cii/maps/svelte';
  import type { CrsConfirmation } from '@cii/maps/svelte';
  import type { MapConfig } from '@cii/maps';
  import Preview from '#lib/Preview.svelte';
  const runtime = createLeafletRuntime();
  const source = {
    provider: 'geojson' as const,
    url: asset('maps/confirmation-sites.geojson')
  };
  let config = $state.raw<MapConfig | null>(null);
  function accept(result: CrsConfirmation<typeof source>) {
    const crs = result.source.crs;
    if (!('code' in crs)) return;
    config = {
      engine: 'leaflet',
      view: {
        center: { crs: 'OGC:CRS84', coordinates: [151.21, -33.87] },
        zoom: 13
      },
      layers: [
        {
          id: 'confirmed-sites',
          attribution: 'CII synthetic confirmation data',
          source: { ...result.source, crs }
        }
      ]
    };
  }
</script>

<Preview title="Source CRS confirmation">
  <p>
    A local GeoJSON file supplies a CRS84 hint. Enter the declarer and confirm
    to add its fictional locations to a map. To try the blocking warning, change
    the code to EPSG:4326 and inspect the preview before acknowledging.
  </p>
  <CrsConfirm {source} {runtime} onconfirm={accept} />
  {#if config}
    <p>The accepted map updates only after another confirmation.</p>
    <MapContainer
      {config}
      {runtime}
      label="Confirmed demonstration locations"
      description="Two fictional locations near Sydney: harbour hub at longitude 151.207, latitude -33.863, and garden at longitude 151.216, latitude -33.873."
    />
  {/if}
</Preview>
