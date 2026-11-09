<script lang="ts">
  import { onMount } from 'svelte';
  import {
    MapContainer,
    Layer,
    createMapRuntime
  } from '../../../src/svelte/index.ts';
  import LayerProbe from './LayerProbe.svelte';
  import type { LayerSpec, MapConfig } from '../../../src/index.ts';
  const runtime = createMapRuntime();
  const engine =
    new URLSearchParams(location.search).get('engine') ?? 'leaflet';
  let mounted = $state(true);
  let showChild = $state(true);
  let duplicate = $state(false);
  let ready = $state(0);
  let spec = $state.raw<LayerSpec>({
    id: 'child',
    attribution: 'Declarative attribution',
    source: {
      provider: 'inline',
      identity: 'one',
      remote: false,
      renderKind: 'features',
      spatial: { type: 'features' },
      crs: {
        crs: { code: 'OGC:CRS84', axisOrder: 'xy' },
        provenance: { kind: 'declared', by: 'fixture' },
        confirmedAt: '2026-11-09T00:00:00Z'
      },
      data: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            id: 'one',
            geometry: { type: 'Point', coordinates: [151.21, -33.87] },
            properties: {}
          }
        ]
      }
    },
    style: { stroke: { color: '#004499', width: 3 } }
  });
  let config = $state.raw<MapConfig>({
    engine,
    view: {
      center: { crs: 'OGC:CRS84', coordinates: [151.21, -33.87] },
      zoom: 14
    },
    controls: [{ id: 'layer-list' }, { id: 'zoom' }],
    layers: []
  });
  const errors: string[] = [];
  onMount(() => {
    window.layersFixture = {
      spec: () => structuredClone(spec),
      update: (value) => {
        spec = value;
      },
      config: () => structuredClone(config),
      configure: (value) => {
        config = value;
      },
      child: (visible) => {
        showChild = visible;
      },
      duplicate: (visible) => {
        duplicate = visible;
      },
      unmount: () => {
        mounted = false;
      },
      errors: () => [...errors]
    };
    return () => {
      delete window.layersFixture;
    };
  });
</script>

<output aria-label="Ready count">{ready}</output>
{#if mounted}
  <MapContainer
    {config}
    {runtime}
    label="Declarative sites"
    height="400px"
    onready={() => ready++}
    onerror={(error) => errors.push(error.code)}
  >
    {#if showChild}<Layer
        {spec}
        onerror={(error) => errors.push(`child:${error.code}`)}
      />{/if}
    {#if duplicate}<Layer
        {spec}
        onerror={(error) => errors.push(`duplicate:${error.code}`)}
      />{/if}
    <LayerProbe />
  </MapContainer>
{/if}
