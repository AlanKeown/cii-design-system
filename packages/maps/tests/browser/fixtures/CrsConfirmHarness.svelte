<script lang="ts">
  import {
    CrsConfirm,
    MapContainer,
    createLeafletRuntime
  } from '../../../src/svelte/index.ts';
  import { validateMapConfig } from '../../../src/config/index.ts';
  import type { CrsConfirmation } from '../../../src/svelte/index.ts';
  import type { SourceInput } from '../../../src/crs/resolve.ts';
  import type { MapConfig } from '../../../src/config/types.ts';
  type Input = SourceInput & {
    url?: string;
    layers?: string;
    data?: Record<string, unknown>;
  };
  const runtime = createLeafletRuntime();
  runtime.sources.register('wkt-fixture', {
    crsMode: 'declared',
    probe: async () => ({
      kind: 'hint',
      hint: { wkt: 'GEOGCRS["<img src=x onerror=alert(1)>"]', from: 'prj' }
    }),
    open: async () => {
      throw new Error('Unused');
    }
  });
  let input = $state.raw<Input>({
    provider: 'geojson',
    url: '/confirmation.geojson'
  });
  let mounted = $state(true);
  let count = $state(0);
  let config = $state.raw<MapConfig | null>(null);
  let last = $state.raw<CrsConfirmation<Input> | null>(null);
  function confirmed(result: CrsConfirmation<Input>) {
    last = result;
    count++;
    if (result.source.provider === 'wkt-fixture') return;
    const validated = validateMapConfig({
      engine: 'leaflet',
      view: { center: { crs: 'OGC:CRS84', coordinates: [151, -34] }, zoom: 10 },
      layers: [
        {
          id: 'confirmed-source',
          source: result.source,
          attribution: 'Fixture source'
        }
      ]
    });
    if (!validated.ok) throw validated.error;
    config = validated.value;
  }
</script>

<button
  onclick={() => {
    input = { provider: 'geojson', url: '/other.geojson' };
  }}>Use another source</button
>
<button
  onclick={() => {
    input = { provider: 'wms', url: '/wms-capabilities', layers: 'demo' };
  }}>Inspect service</button
>
<button
  onclick={() => {
    input = { provider: 'wkt-fixture' };
  }}>Inspect WKT</button
>
<button onclick={() => (mounted = !mounted)}>Toggle confirmation</button>
<output aria-label="Confirmation count">{count}</output>
<output aria-label="Confirmed provenance"
  >{last ? JSON.stringify(last.confirmed) : ''}</output
>
{#if mounted}<CrsConfirm source={input} {runtime} onconfirm={confirmed} />{/if}
{#if config}<MapContainer {config} {runtime} label="Accepted source" />{/if}
