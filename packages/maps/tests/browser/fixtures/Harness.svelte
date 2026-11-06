<script lang="ts">
  import { onMount } from 'svelte';
  import { MapContainer } from '../../../src/svelte/index.ts';
  import { createLeafletRuntime } from '../../../src/map-controller.ts';
  import LeafletEngine from '../../../src/leaflet.ts';
  import { createCrsRegistry, EngineRegistry } from '../../../src/index.ts';
  import { checkEngineConformance } from '../../../src/testing.ts';
  import type { IMapEngine, MapConfig, ViewState } from '../../../src/index.ts';
  import type { Map as LeafletMap } from 'leaflet';
  const viewEvents: { view: ViewState; source: 'api' | 'user' }[] = [];
  let overrideConfig = $state.raw<MapConfig | undefined>();
  let mounted = $state(true);
  let visible = $state(true);
  let large = $state(false);
  let remote = $state(false);
  const errorCodes: string[] = [];
  let errorCount = $state(0);
  let readyCount = $state(0);
  let destroyed = $state(0);
  let engine = $state.raw<IMapEngine | null>(null);
  let dark = $state(false);
  let text = $state('Safe site');
  const runtime = createLeafletRuntime();
  const params = new URLSearchParams(location.search);
  const controlled = (x: number, rotation = 0): ViewState => ({
    center: [x, 0],
    resolution: 1000,
    rotation,
    extent: [0, 0, 0, 0]
  });
  let controlledView = $state.raw<ViewState | undefined>(
    params.has('controlled-view') ? controlled(0) : undefined
  );
  const displayCrs = params.get('display') ?? 'EPSG:3857';
  if (params.has('delayed-engine')) {
    const loader = runtime.engines.require('leaflet');
    const delay = Number(params.get('delayed-engine'));
    const registry = new EngineRegistry();
    registry.register('leaflet', async () => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return loader();
    });
    runtime.engines = registry;
  }
  const config = $derived<MapConfig>({
    engine: 'leaflet',
    display: { crs: displayCrs },
    ...(params.has('readouts')
      ? {
          controls: [
            { id: 'zoom' as const },
            { id: 'scale' as const },
            {
              id: 'coords' as const,
              readoutCrs: params.get('readout') ?? 'OGC:CRS84'
            }
          ]
        }
      : {}),
    view: {
      center: { crs: 'OGC:CRS84', coordinates: [151.21, -33.87] },
      ...(displayCrs === 'EPSG:3857' ? { zoom: 14 } : { resolution: 0.0001 })
    },
    layers: [
      ...(params.has('mixed-layers')
        ? [
            {
              id: 'remote',
              attribution: 'Remote fixture',
              source: {
                provider: 'geojson',
                url: '/sites.geojson',
                crs: {
                  code: 'OGC:CRS84',
                  provenance: { kind: 'declared' as const, by: 'test' }
                }
              }
            },
            {
              id: 'polar',
              source: {
                provider: 'inline',
                crs: {
                  code: 'OGC:CRS84',
                  provenance: { kind: 'declared' as const, by: 'test' }
                },
                data: {
                  type: 'Feature',
                  properties: {},
                  geometry: { type: 'Point', coordinates: [0, 89] }
                }
              }
            }
          ]
        : []),
      {
        id: 'sites',
        visible,
        attribution: 'Synthetic <img src=x onerror=alert(1)> attribution',
        source: remote
          ? {
              provider: 'geojson',
              url: '/sites.geojson',
              crs: {
                code: 'OGC:CRS84',
                provenance: { kind: 'declared', by: 'test' }
              }
            }
          : {
              provider: 'inline',
              crs: {
                code: 'EPSG:7844',
                provenance: { kind: 'declared', by: 'test' }
              },
              data: {
                type: 'FeatureCollection',
                features: [
                  {
                    type: 'Feature',
                    id: 'site',
                    properties: { name: text },
                    geometry: { type: 'Point', coordinates: [151.21, -33.87] }
                  }
                ]
              }
            },
        style: {
          point: { shape: 'circle', size: large ? 24 : 12 },
          ...(!params.has('default-style')
            ? { stroke: { color: 'token:--cii-map-feature', width: 3 } }
            : {})
        }
      }
    ]
  });
  function ready(value: IMapEngine) {
    engine = value;
    readyCount++;
    value.on('destroy', () => destroyed++);
  }
  onMount(() => {
    window.mapHarness = {
      errorCodes: () => [...errorCodes],
      config: () => $state.snapshot(overrideConfig ?? config),
      setConfig: (next: MapConfig) => {
        overrideConfig = next;
      },
      view: () => engine!.getView(),
      viewEvents: () => structuredClone(viewEvents),
      clearViewEvents: () => {
        viewEvents.length = 0;
      },
      setView: (view: Partial<ViewState>) => {
        engine!.setView(view);
      },
      setBoundView: (view: ViewState) => {
        controlledView = view;
      },
      stats: async () => {
        const L = await import('leaflet');
        let count = 0;
        let radius = 0;
        let color = '';
        engine!.native<LeafletMap>().eachLayer((layer) => {
          if (layer instanceof L.CircleMarker) {
            count++;
            radius = layer.getRadius();
            color = layer.options.color ?? '';
          }
        });
        return { count, radius, color };
      },
      hit: () => {
        const map = engine!.native<LeafletMap>();
        const size = map.getSize();
        return engine!.interaction
          .hitTest([size.x / 2, size.y / 2], { tolerancePx: 4 })
          .map((hit) => hit.feature.id);
      },
      contract: async () => {
        const node = document.createElement('div');
        node.style.width = '800px';
        node.style.height = '600px';
        document.body.append(node);
        const candidate = new LeafletEngine();
        try {
          await candidate.mount(node, {
            displayCrs: await createCrsRegistry().resolve('EPSG:3857')
          });
          return checkEngineConformance(candidate, {
            id: 'contract',
            renderKind: 'features',
            displayCrs: 'EPSG:3857',
            sourceCrs: {
              crs: { code: 'OGC:CRS84', axisOrder: 'xy' },
              provenance: { kind: 'declared', by: 'contract' },
              confirmedAt: new Date().toISOString()
            },
            data: { type: 'FeatureCollection', features: [] },
            visible: true,
            opacity: 1,
            order: 0
          });
        } finally {
          candidate.destroy();
          node.remove();
        }
      }
    };
    return () => {
      delete window.mapHarness;
    };
  });
</script>

<p id="external-description">Additional context</p>
<p id="fixture-details">Map details</p>
<div data-cii-theme={dark ? 'dark' : 'light'}>
  <button onclick={() => (mounted = !mounted)}>Toggle mount</button>
  <button onclick={() => (visible = !visible)}>Toggle visibility</button>
  <button onclick={() => (large = !large)}>Toggle size</button>
  <button onclick={() => (remote = !remote)}>Toggle remote</button>
  <button onclick={() => (dark = !dark)}>Toggle theme</button>
  <button onclick={() => (controlledView = controlled(10000))}
    >Set controlled view</button
  >
  <button onclick={() => (controlledView = controlled(0, 1))}
    >Invalid controlled view</button
  >
  <button onclick={() => (text = '<img src=x onerror=alert(1)>')}
    >Hostile property</button
  >
  <output aria-label="Ready count">{readyCount}</output><output
    aria-label="Destroyed count">{destroyed}</output
  ><output aria-label="Error count">{errorCount}</output>
  <p aria-label="Feature name">{text}</p>
  <output aria-label="Bound center">{controlledView?.center[0]}</output>
  {#if mounted}<MapContainer
      config={overrideConfig ?? config}
      {runtime}
      bind:view={controlledView}
      label="Fixture"
      description="Map description"
      class="fixture-map"
      data-testid="map-root"
      aria-describedby="external-description"
      aria-details="fixture-details"
      onready={ready}
      onviewchange={(view, source) => viewEvents.push({ view, source })}
      onerror={(error) => {
        errorCount++;
        errorCodes.push(error.code);
      }}
    />{/if}
</div>
