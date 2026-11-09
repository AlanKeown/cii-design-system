<script lang="ts">
  import { onMount } from 'svelte';
  import { MapContainer, createMapRuntime } from '../../../src/svelte/index.ts';
  import { definitions } from '../../../src/crs/definitions.ts';
  import { checkEngineConformance } from '../../../src/testing.ts';
  import type { IMapEngine, MapConfig, ViewState } from '../../../src/index.ts';
  import type { Map as OLMap } from 'ol';
  import type { Map as MLMap } from 'maplibre-gl';
  import type { Map as LeafletMap } from 'leaflet';
  const params = new URLSearchParams(location.search);
  const engineId = params.get('engine') ?? 'openlayers';
  const display = params.get('display') ?? 'EPSG:3857';
  const definition = {
    ...definitions.find((definition) => definition.code === 'EPSG:7856')!,
    tileMatrix: {
      origin: [0, 10_000_000] as const,
      resolutions: Array.from(
        { length: 25 },
        (_, zoom) => 10_000_000 / 256 / 2 ** zoom
      )
    }
  };
  const runtime = createMapRuntime({
    definitions: params.has('no-grid') ? [] : [definition]
  });
  let config = $state.raw<MapConfig>({
    engine: engineId,
    display: { crs: display },
    view: {
      center: { crs: 'EPSG:7844', coordinates: [151.21, -33.87] },
      resolution: 10
    },
    controls: [
      { id: 'zoom' },
      { id: 'layer-list' },
      { id: 'coords', readoutCrs: 'EPSG:7844' },
      { id: 'scale' }
    ],
    layers: [
      {
        id: 'sites',
        attribution: '<b>Synthetic sites</b>',
        source: {
          provider: 'inline',
          crs: {
            code: 'EPSG:7844',
            provenance: { kind: 'declared', by: 'fixture' }
          },
          data: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                id: 'site',
                properties: { name: '<img src=x>' },
                geometry: { type: 'Point', coordinates: [151.21, -33.87] }
              }
            ]
          }
        },
        style: {
          stroke: { color: 'token:--cii-map-feature', width: 3 },
          fill: { color: '#00cc00', opacity: 1 },
          point: { shape: 'circle', size: 16 }
        }
      }
    ]
  });
  let engine = $state.raw<IMapEngine>();
  let ready = $state(0);
  let mounted = $state(true);
  let dark = $state(false);
  const errors: string[] = [];
  const switches: string[] = [];
  const events: { source: string; view: ViewState }[] = [];
  onMount(() => {
    window.adapters = {
      config: () => structuredClone(config),
      update: (value) => {
        config = value;
      },
      engine: () => engine!,
      view: () => engine!.getView(),
      snapshot: () => ({
        ready,
        errors: [...errors],
        switches: [...switches],
        events: [...events]
      }),
      switchTo: (code) => {
        config = { ...config, display: { crs: code } };
      },
      rendered: () => {
        if (!engine) return 0;
        if (engine.id === 'openlayers')
          return engine.native<OLMap>().getFeaturesAtPixel([384, 256]).length;
        if (engine.id === 'maplibre')
          return engine.native<MLMap>().queryRenderedFeatures([384, 256])
            .length;
        let count = 0;
        engine.native<LeafletMap>().eachLayer((layer) => {
          if ('getLatLng' in layer) count++;
        });
        return count;
      },
      contract: async () => {
        const node = document.createElement('div');
        node.style.cssText = 'width:768px;height:512px';
        document.body.append(node);
        const candidate = await runtime.engines.create(engineId);
        try {
          const definition = await runtime.crs.resolve(display);
          const transform = await runtime.transforms.prepare({
            source: 'EPSG:7844',
            target: display
          });
          await candidate.mount(node, {
            displayCrs: definition,
            view: {
              center: transform.coordinate([151.21, -33.87]),
              resolution: 10
            }
          });
          return checkEngineConformance(candidate, {
            id: 'contract',
            renderKind: 'features',
            data: { type: 'FeatureCollection', features: [] },
            displayCrs: display,
            sourceCrs: {
              crs: { code: display, axisOrder: 'xy' },
              provenance: { kind: 'declared', by: 'test' },
              confirmedAt: '2026-11-09T00:00:00Z'
            },
            visible: true,
            opacity: 1,
            order: 0
          });
        } finally {
          candidate.destroy();
          node.remove();
        }
      },
      unmount: () => {
        mounted = false;
      }
    };
    return () => {
      delete window.adapters;
    };
  });
</script>

<div data-cii-theme={dark ? 'dark' : 'light'} style="width: 768px">
  <button
    onclick={() => {
      dark = !dark;
    }}>Toggle theme</button
  >
  <output aria-label="Ready count">{ready}</output>
  {#if mounted}
    <MapContainer
      {config}
      {runtime}
      label="Adapter sites"
      height="512px"
      onready={(value) => {
        engine = value;
        ready++;
      }}
      onerror={(error) => errors.push(error.code)}
      ondisplaycrschange={(change) => switches.push(change.current)}
      onviewchange={(view, source) => events.push({ view, source })}
    />
  {/if}
</div>
