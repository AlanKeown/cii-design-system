import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLeafletRuntime, MapController } from '../src/map-controller.ts';
import {
  confirmProbedSourceCrs,
  resolveSourceCrs
} from '../src/crs/resolve.ts';
import { createInterpretationPreview } from '../src/crs/interpretation-preview.ts';
import { FakeMapEngine } from '../src/testing.ts';
import type { SourceInput, ProbeContext } from '../src/crs/resolve.ts';
import type { MapConfig } from '../src/config/types.ts';

const data = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [151, -34],
          [152, -33]
        ]
      }
    }
  ]
};
const source = {
  provider: 'inline',
  data,
  crs: {
    code: 'EPSG:4326',
    axisOrder: 'xy' as const,
    provenance: { kind: 'declared' as const, by: 'Reviewer' }
  }
};
const hint = { code: 'OGC:CRS84', from: 'rfc7946_default' as const };
function context(runtime = createLeafletRuntime()): ProbeContext {
  return {
    sources: runtime.sources,
    crsRegistry: runtime.crs,
    displayCrs: 'EPSG:3857'
  };
}

test('inspection previews use raw values and explicit axis order without mutating source vertices', async () => {
  const runtime = createLeafletRuntime();
  const probe = await runtime.sources
    .require('inline')
    .probe(source, context(runtime));
  assert.deepEqual(probe.preview, {
    sample: [151, -34],
    extent: [151, -34, 152, -33]
  });
  const preview = await createInterpretationPreview(
    { sample: [-34, 151], extent: [-34, 151, -33, 152] },
    { code: 'EPSG:4326', axisOrder: 'yx' },
    runtime
  );
  assert.deepEqual(preview.sample, [151, -34]);
  assert.deepEqual(data.features[0].geometry.coordinates, [
    [151, -34],
    [152, -33]
  ]);
  assert.equal(preview.config.layers[0].source.provider, 'inline');
  assert.deepEqual(preview.config.view.center.coordinates, [151.5, -33.5]);
});

test('confirming a probe still blocks missing declarations, unverified WKT, unknown CRSs and changed hints', async () => {
  const ctx = context();
  const missing = await confirmProbedSourceCrs(
    { provider: 'inline' },
    { kind: 'hint', hint },
    ctx
  );
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error.code, 'CRS_NOT_CONFIRMED');
  const wkt = await confirmProbedSourceCrs(
    source,
    { kind: 'hint', hint: { wkt: 'GEOGCRS["Unverified"]', from: 'prj' } },
    ctx
  );
  assert.equal(wkt.ok, false);
  if (!wkt.ok) assert.equal(wkt.error.code, 'CRS_HINT_MISMATCH');
  const result = await confirmProbedSourceCrs(
    source,
    { kind: 'hint', hint },
    {
      ...ctx,
      hintMismatchAcknowledgement: {
        crs: { code: 'EPSG:4326', axisOrder: 'xy' },
        hint
      }
    }
  );
  assert.ok(result.ok);
  assert.equal(result.value.provenance.kind, 'declared');
  if (result.value.provenance.kind === 'declared')
    assert.equal(result.value.provenance.hintMismatchAcknowledged, true);
  for (const changedHint of [
    { ...hint, code: 'EPSG:7844' },
    { ...hint, from: 'geojson_crs' as const }
  ]) {
    const refused = await confirmProbedSourceCrs(
      source,
      { kind: 'hint', hint: changedHint },
      {
        ...ctx,
        hintMismatchAcknowledgement: {
          crs: { code: 'EPSG:4326', axisOrder: 'xy' },
          hint
        }
      }
    );
    assert.equal(refused.ok, false);
  }
  const unknown = await confirmProbedSourceCrs(
    { ...source, crs: { ...source.crs, code: 'EPSG:unknown' } },
    { kind: 'hint' },
    ctx
  );
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.error.code, 'CRS_NOT_FOUND');
});

test('runtime approvals survive config copying and remain scoped to the complete source/declaration/hint', async () => {
  const runtime = createLeafletRuntime();
  const result = await confirmProbedSourceCrs(
    source,
    { kind: 'hint', hint },
    { ...context(runtime), acknowledgeHintMismatch: true }
  );
  assert.ok(result.ok);
  runtime.rememberConfirmation(source, result.value);
  const copied = {
    crs: structuredClone(source.crs),
    data: structuredClone(data),
    provider: 'inline'
  };
  assert.ok(runtime.acknowledgementFor(copied));
  assert.equal(
    runtime.acknowledgementFor({ ...source, data: { ...data, changed: true } }),
    undefined
  );
  assert.equal(
    runtime.acknowledgementFor({
      ...source,
      crs: { ...source.crs, axisOrder: 'yx' }
    }),
    undefined
  );
  const other = createLeafletRuntime();
  assert.equal(other.acknowledgementFor(source), undefined);
  const evidence = runtime.acknowledgementFor(source)!;
  evidence.hint.code = 'EPSG:7844';
  assert.equal(runtime.acknowledgementFor(source)!.hint.code, hint.code);
  runtime.forgetConfirmation(source);
  assert.equal(runtime.acknowledgementFor(source), undefined);
});

test('a UI-style acknowledgement reaches map reconciliation without authorising a sibling', async () => {
  const runtime = createLeafletRuntime({
    fetch: async () => new Response(JSON.stringify(data))
  });
  runtime.engines.register('fake', async () => ({ default: FakeMapEngine }));
  runtime.renderers.register('fake:features', {
    compatibility: () => undefined,
    prepare: (resolved) => ({ data: resolved.data })
  });
  const input = {
    provider: 'geojson' as const,
    url: '/one.geojson',
    crs: source.crs
  };
  const confirmed = await resolveSourceCrs(input, {
    ...context(runtime),
    acknowledgeHintMismatch: true
  });
  assert.ok(confirmed.ok);
  runtime.rememberConfirmation(input, confirmed.value);
  const controller = new MapController(
    { clientWidth: 800, clientHeight: 600 } as HTMLElement,
    runtime
  );
  const config: MapConfig = {
    engine: 'fake',
    view: { center: { crs: 'EPSG:3857', coordinates: [0, 0] }, zoom: 1 },
    layers: [
      { id: 'one', source: input, attribution: 'Fixture' },
      {
        id: 'two',
        source: { ...input, url: '/two.geojson' },
        attribution: 'Fixture'
      }
    ]
  };
  try {
    await controller.applyConfig(config);
    assert.deepEqual(
      controller.snapshot().layers.map((layer) => layer.id),
      ['one']
    );
    assert.equal(
      controller.snapshot().layerErrors[0].error.code,
      'CRS_HINT_MISMATCH'
    );
  } finally {
    controller.destroy();
  }
});

test('metadata confirmation records policy selection without allowing service declarations', async () => {
  const runtime = createLeafletRuntime();
  runtime.sources.register('metadata-test', {
    crsMode: 'service-metadata',
    probe: async () => ({ kind: 'metadata', candidates: [] }),
    open: async () => {
      throw new Error('unused');
    }
  });
  const probe = {
    kind: 'metadata' as const,
    candidates: ['EPSG:4326', 'EPSG:3857'].map((code) => ({
      crs: { code, axisOrder: 'xy' as const },
      provenance: {
        kind: 'service-metadata' as const,
        url: '/capabilities.xml',
        element: `CRS[${code}]`
      }
    }))
  };
  const native = await confirmProbedSourceCrs(
    { provider: 'metadata-test', crs: { fromMetadata: true } },
    probe,
    context(runtime)
  );
  assert.ok(native.ok);
  assert.equal(native.value.crs.code, 'EPSG:4326');
  const display = await confirmProbedSourceCrs(
    {
      provider: 'metadata-test',
      crs: { fromMetadata: true, policy: 'prefer-display' }
    },
    probe,
    context(runtime)
  );
  assert.ok(display.ok);
  assert.equal(display.value.crs.code, 'EPSG:3857');
  const refused = await confirmProbedSourceCrs(
    { ...source, provider: 'metadata-test' },
    probe,
    context(runtime)
  );
  assert.equal(refused.ok, false);
  if (!refused.ok)
    assert.equal(refused.error.code, 'CRS_DECLARATION_NOT_ALLOWED');
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(
    confirmProbedSourceCrs(
      source,
      { kind: 'hint' },
      { ...context(runtime), signal: aborted.signal }
    ),
    { name: 'AbortError' }
  );
});
