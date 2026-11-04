import { createCrsRegistry, Registry } from '../src/index.ts';
import type {
  ConfirmedCrs,
  FeatureBatch,
  LayerRenderer,
  LayerSpec,
  ResolvedLayer
} from '../src/index.ts';
import { FakeMapEngine } from '../src/testing.ts';
import type { FakeEngineOptions } from '../src/testing.ts';

export function confirmed(code = 'EPSG:3857'): ConfirmedCrs {
  return {
    crs: { code, axisOrder: 'xy' },
    provenance: { kind: 'declared', by: 'fixture' },
    confirmedAt: '2026-11-04T00:00:00.000Z'
  };
}

export function features(id = 1): FeatureBatch {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id,
        geometry: { type: 'Point', coordinates: [151, -33] },
        properties: { label: 'Fixture' }
      }
    ]
  };
}

export function layer(id = 'points'): LayerSpec {
  return {
    id,
    source: {
      provider: 'inline',
      remote: false,
      identity: id,
      crs: confirmed(),
      renderKind: 'features',
      data: features(),
      spatial: { type: 'features' }
    }
  };
}

export function resolvedLayer(id = 'points'): ResolvedLayer {
  return {
    id,
    renderKind: 'features',
    data: features(),
    displayCrs: 'EPSG:3857',
    sourceCrs: confirmed(),
    visible: true,
    opacity: 1,
    order: 0
  };
}

export function renderers(renderer?: LayerRenderer): Registry<LayerRenderer> {
  const registry = new Registry<LayerRenderer>();
  for (const kind of [
    'features',
    'raster-tiles',
    'raster-image',
    'vector-tiles'
  ]) {
    // Numeric/data fixtures only. This renderer makes no geographic transformation claim.
    registry.register(
      `fake:${kind}`,
      renderer ?? {
        compatibility: () => undefined,
        prepare: (source) => ({ data: source.data })
      }
    );
  }
  return registry;
}

export async function mounted(options: FakeEngineOptions = {}) {
  const engine = new FakeMapEngine(options);
  const display = await createCrsRegistry().resolve('EPSG:3857');
  await engine.mount(
    { clientWidth: 800, clientHeight: 600 },
    { displayCrs: display }
  );
  return { engine, display };
}

export function gate<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
