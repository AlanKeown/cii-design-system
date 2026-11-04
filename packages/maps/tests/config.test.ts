import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { Ajv } from 'ajv';
import { getMapConfigSchema, validateMapConfig } from '../src/config/index.ts';
import { createCrsRegistry, Registry, resolveSourceCrs } from '../src/index.ts';
import type { MapConfig, SourceProvider } from '../src/index.ts';

const declaration = {
  code: 'EPSG:3857',
  provenance: { kind: 'declared' as const, by: 'test' }
};
function config(): MapConfig {
  return {
    engine: 'openlayers',
    view: {
      center: { crs: 'OGC:CRS84', coordinates: [151.21, -33.87] },
      zoom: 12
    },
    layers: [
      {
        id: 'streets',
        source: {
          provider: 'xyz',
          url: 'https://tiles.example.org/{z}/{x}/{y}.png',
          crs: declaration
        },
        attribution: 'Example tiles'
      }
    ]
  };
}

test('schema defaults apply to a copy; serialisation is stable and engine stays explicit', () => {
  const input = config();
  const result = validateMapConfig(input);
  assert.ok(result.ok);
  assert.deepEqual(result.value.display, {
    crs: 'EPSG:3857',
    allowExperimental: false
  });
  assert.equal(input.display, undefined);
  assert.deepEqual(
    validateMapConfig(JSON.parse(JSON.stringify(result.value))),
    result
  );
  assert.ok(!validateMapConfig({ ...input, engine: undefined }).ok);
  assert.ok(!validateMapConfig({ view: input.view, layers: [] }).ok);
  const custom = validateMapConfig({
    ...input,
    engine: 'third-party-engine',
    display: { crs: 'EPSG:7856' }
  });
  assert.ok(custom.ok);
  assert.equal(custom.value.display.crs, 'EPSG:7856');
});

test('JSON Schema can independently validate configs; callers cannot mutate the canonical schema', () => {
  const schema = getMapConfigSchema();
  const validate = new Ajv({ strict: true, strictRequired: false }).compile(
    schema
  );
  assert.equal(validate(config()), true);
  assert.equal(validate({ ...config(), apiKey: 'secret-value' }), false);
  schema.required.length = 0;
  assert.ok(!validateMapConfig({}).ok);
});

test('unknown and credential settings fail at every configuration boundary without echoing values', () => {
  const original = config();
  const unknowns = [
    { ...original, apiKey: 'secret-value' },
    { ...original, display: { apiKey: 'secret-value' } },
    { ...original, view: { ...original.view, apiKey: 'secret-value' } },
    {
      ...original,
      layers: [{ ...original.layers[0], apiKey: 'secret-value' }]
    },
    {
      ...original,
      layers: [
        {
          ...original.layers[0],
          source: {
            ...original.layers[0].source,
            headers: { Authorization: 'secret-value' }
          }
        }
      ]
    },
    { ...original, controls: [{ id: 'zoom', apiKey: 'secret-value' }] },
    {
      ...original,
      capture: {
        target: 'streets',
        persistence: 'pg',
        modes: ['point'],
        apiKey: 'secret-value'
      }
    }
  ];
  for (const input of unknowns) {
    const result = validateMapConfig(input);
    assert.ok(!result.ok);
    assert.equal(result.error.code, 'CONFIG_INVALID');
    assert.ok(!JSON.stringify(result.error.details).includes('secret-value'));
    assert.ok(!result.error.message.includes('secret-value'));
  }
});

test('files and tiles require declared CRS; service CRS must come from metadata', () => {
  for (const provider of [
    'xyz',
    'geojson',
    'gpkg',
    'kml',
    'gpx',
    'shapefile',
    'spatialite',
    'csv',
    'flatgeobuf'
  ]) {
    const original = config();
    const layer = original.layers[0];
    for (const crs of [undefined, { fromMetadata: true }]) {
      assert.ok(
        !validateMapConfig({
          ...original,
          layers: [{ ...layer, source: { provider, url: '/data', crs } }]
        }).ok
      );
    }
    assert.ok(
      validateMapConfig({
        ...original,
        layers: [
          { ...layer, source: { provider, url: '/data', crs: declaration } }
        ]
      }).ok
    );
  }
  const original = config();
  for (const provider of ['wms', 'wmts', 'wfs', 'oapif', 'arcgis-rest']) {
    const source = {
      provider,
      url: 'https://example.org/data',
      crs: { fromMetadata: true, policy: 'prefer-display' }
    };
    assert.ok(
      validateMapConfig({
        ...original,
        layers: [{ ...original.layers[0], source }]
      }).ok
    );
    assert.ok(
      !validateMapConfig({
        ...original,
        layers: [
          { ...original.layers[0], source: { ...source, crs: declaration } }
        ]
      }).ok
    );
  }
});

test('all URL-backed layers require nonblank attribution, including relative file URLs', () => {
  for (const attribution of [undefined, '', '   ']) {
    const input = config();
    const layer = { ...input.layers[0], attribution };
    if (attribution === undefined) delete layer.attribution;
    const result = validateMapConfig({ ...input, layers: [layer] });
    assert.ok(!result.ok);
    assert.equal(result.error.code, 'ATTRIBUTION_REQUIRED');
  }
  const input = config();
  assert.ok(
    !validateMapConfig({
      ...input,
      layers: [
        {
          id: 'local-file',
          source: { provider: 'gpkg', url: '/data.gpkg', crs: declaration }
        }
      ]
    }).ok
  );
});

test('duplicate layer IDs and broken capture/snap references fail before source probing', () => {
  const input = config();
  assert.ok(
    !validateMapConfig({ ...input, layers: [...input.layers, input.layers[0]] })
      .ok
  );
  const editable = {
    id: 'hydrants',
    editable: true,
    source: {
      provider: 'postgis',
      target: { schema: 'assets', table: 'hydrants' },
      crs: { fromMetadata: true }
    }
  };
  const capture = {
    target: 'hydrants',
    persistence: 'sveltekit-pg',
    modes: ['point'],
    snap: { layers: ['streets'], tolerancePx: 10 }
  };
  const valid = { ...input, layers: [...input.layers, editable], capture };
  assert.ok(validateMapConfig(valid).ok);
  assert.ok(
    !validateMapConfig({ ...valid, capture: { ...capture, target: 'missing' } })
      .ok
  );
  assert.ok(
    !validateMapConfig({ ...valid, capture: { ...capture, target: 'streets' } })
      .ok
  );
  assert.ok(
    !validateMapConfig({
      ...valid,
      capture: { ...capture, snap: { layers: ['missing'], tolerancePx: 10 } }
    }).ok
  );
  assert.ok(
    !validateMapConfig({
      ...input,
      layers: [{ ...input.layers[0], editable: true }]
    }).ok
  );
});

test('view, style, and capture numeric limits reject malformed values', () => {
  const input = config();
  const invalid = [
    { ...input, view: { center: input.view.center } },
    { ...input, view: { ...input.view, resolution: 0 } },
    { ...input, view: { ...input.view, minZoom: 10, maxZoom: 2 } },
    {
      ...input,
      view: {
        ...input.view,
        center: { ...input.view.center, coordinates: [1, 2, 3] }
      }
    },
    { ...input, layers: [{ ...input.layers[0], opacity: 2 }] },
    {
      ...input,
      layers: [
        { ...input.layers[0], style: { point: { shape: 'circle', size: -1 } } }
      ]
    }
  ];
  for (const value of invalid) assert.ok(!validateMapConfig(value).ok);
});

test('non-JSON values, cycles and non-finite coordinates fail without conversion or throwing', () => {
  const input = config();
  const cyclic: Record<string, unknown> = { ...input };
  cyclic.self = cyclic;
  for (const value of [
    cyclic,
    new Date(),
    { ...input, extra: 1n },
    { ...input, extra: () => {} },
    { ...input, view: { ...input.view, resolution: Infinity } }
  ]) {
    const result = validateMapConfig(value);
    assert.ok(!result.ok);
    assert.equal(result.error.code, 'CONFIG_INVALID');
  }
});

test('accessors are not read; sparse arrays and object inspection failures are rejected', () => {
  let reads = 0;
  const input = config();
  const accessor = {
    ...input,
    get length() {
      reads++;
      return 1;
    }
  };
  const proxy = new Proxy(
    {},
    {
      ownKeys() {
        throw new Error('Hostile inspection.');
      }
    }
  );
  for (const value of [accessor, proxy, { ...input, controls: new Array(1) }]) {
    assert.ok(!validateMapConfig(value).ok);
  }
  assert.equal(reads, 0);
});

test('generated source types pass directly into the extensible CRS resolver', async () => {
  const validated = validateMapConfig(config());
  assert.ok(validated.ok);
  const sources = new Registry<SourceProvider>();
  sources.register('xyz', {
    crsMode: 'declared',
    probe: async () => ({ kind: 'hint' })
  });
  const confirmed = await resolveSourceCrs(validated.value.layers[0].source, {
    crsRegistry: createCrsRegistry(),
    sources,
    displayCrs: validated.value.display.crs
  });
  assert.ok(confirmed.ok);
  assert.equal(confirmed.value.provenance.kind, 'declared');
  // Config validation does not create or accept runtime confirmations.
  const source = validated.value.layers[0].source;
  const forged = {
    ...config(),
    layers: [
      { ...config().layers[0], source: { ...source, crs: confirmed.value } }
    ]
  };
  assert.ok(!validateMapConfig(forged).ok);
});

test('the documented configuration example remains valid', async () => {
  const plan = await readFile(
    new URL(
      '../../../docs/svelte-mapping-components-development-plan.md',
      import.meta.url
    ),
    'utf8'
  );
  const example = plan
    .slice(plan.indexOf('### 12.5 Configuration schema'))
    .match(/```jsonc\n([\s\S]*?)\n```/);
  assert.ok(example);
  const result = validateMapConfig(JSON.parse(example[1]));
  assert.ok(result.ok, result.ok ? undefined : result.error.message);
});

test('standalone validation runs when dynamic code evaluation is disabled', async () => {
  const moduleUrl = new URL('../src/config/index.ts', import.meta.url).href;
  const { stdout } = await promisify(execFile)(process.execPath, [
    '--disallow-code-generation-from-strings',
    '--input-type=module',
    '-e',
    `import { validateMapConfig } from ${JSON.stringify(moduleUrl)};
     const result = validateMapConfig(${JSON.stringify(config())});
     if (!result.ok) throw result.error;
     console.log(result.value.display.crs);`
  ]);
  assert.equal(stdout.trim(), 'EPSG:3857');
});
