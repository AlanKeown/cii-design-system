import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  createExtendedMapConfigValidator,
  compileExtendedMapConfigValidator,
  mergeMapConfigSchema
} from '../src/config/extensions.ts';
import type { ConfigSchemaExtension } from '../src/config/extensions.ts';
import { validateMapConfig, validateConfigWith } from '../src/config/index.ts';

const extension: ConfigSchemaExtension = {
  id: 'example',
  sources: [
    {
      id: 'custom-file',
      crsMode: 'declared',
      required: ['url'],
      properties: { url: { type: 'string', minLength: 1 } }
    }
  ],
  controls: [
    {
      id: 'bookmarks',
      required: ['names'],
      properties: { names: { type: 'array', items: { type: 'string' } } }
    }
  ],
  settings: {
    type: 'object',
    additionalProperties: false,
    required: ['enabled'],
    properties: { enabled: { type: 'boolean' } }
  }
};
function config() {
  return {
    engine: 'leaflet',
    view: { center: { crs: 'OGC:CRS84', coordinates: [151, -33] }, zoom: 12 },
    layers: [
      {
        id: 'places',
        source: {
          provider: 'custom-file',
          url: '/places.bin',
          crs: {
            code: 'OGC:CRS84',
            provenance: { kind: 'declared', by: 'test' }
          }
        },
        attribution: 'Example data'
      }
    ],
    controls: [{ id: 'bookmarks', names: ['Home'], position: 'top-left' }],
    extensions: { example: { enabled: true } }
  };
}

test('extension sources, controls and namespaced settings compose without changing core schema', () => {
  const input = config();
  const before = structuredClone(input);
  const validate = createExtendedMapConfigValidator([extension]);
  const result = validate(input);
  assert.ok(result.ok);
  assert.equal(result.value.display.crs, 'EPSG:3857');
  assert.deepEqual(input, before);
  assert.equal(validateMapConfig(input).ok, false);
  assert.equal(createExtendedMapConfigValidator([])(input).ok, false);
  assert.equal(validate({ ...input, controls: [{ id: 'zoom' }] }).ok, true);
});

test('extension validation preserves CRS, attribution, editability and cross-reference checks', () => {
  const validate = createExtendedMapConfigValidator([extension]);
  const original = config();
  const mutations = [
    (value: ReturnType<typeof config>) => {
      Reflect.deleteProperty(value.layers[0].source, 'crs');
    },
    (value: ReturnType<typeof config>) => {
      Reflect.deleteProperty(value.layers[0], 'attribution');
    },
    (value: ReturnType<typeof config>) => {
      Object.assign(value.layers[0], { editable: true });
    },
    (value: ReturnType<typeof config>) => {
      value.layers.push(structuredClone(value.layers[0]));
    },
    (value: ReturnType<typeof config>) => {
      Object.assign(value.layers[0].source, { secret: 'credential-value' });
    },
    (value: ReturnType<typeof config>) => {
      Object.assign(value.extensions, { unknown: {} });
    },
    (value: ReturnType<typeof config>) => {
      Object.assign(value, {
        capture: { target: 'missing', persistence: 'test', modes: ['polygon'] }
      });
    },
    (value: ReturnType<typeof config>) => {
      Object.assign(value.view, { minZoom: 10, maxZoom: 5 });
    }
  ];
  for (const mutate of mutations) {
    const value = structuredClone(original);
    mutate(value);
    const result = validate(value);
    assert.equal(result.ok, false);
    if (!result.ok)
      assert.ok(
        !JSON.stringify(result.error.details).includes('credential-value')
      );
  }
});

test('conflicting registrations and fragments that overwrite core fields fail before validation', () => {
  for (const extensions of [
    [extension, extension],
    [{ id: 'bad', sources: [{ id: 'geojson', crsMode: 'declared' as const }] }],
    [{ id: 'bad', controls: [{ id: 'zoom' }] }],
    [
      {
        id: 'bad',
        sources: [
          {
            id: 'custom',
            crsMode: 'declared' as const,
            properties: { crs: true }
          }
        ]
      }
    ],
    [{ id: 'bad', settings: { $ref: 'https://example.org/schema' } }],
    [{ id: 'bad', settings: { $id: 'urn:override', type: 'object' } }]
  ])
    assert.throws(() => mergeMapConfigSchema(extensions));
  const schema = mergeMapConfigSchema([extension]);
  schema.required = [];
  assert.equal(createExtendedMapConfigValidator([extension])({}).ok, false);
});

test('standalone extension predicate runs without Ajv and retains boundary checks', async () => {
  const source = compileExtendedMapConfigValidator([extension]);
  const module = await import(
    `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  );
  const validate = (input: unknown) =>
    validateConfigWith(input, module.default);
  assert.equal(validate(config()).ok, true);
  assert.equal(validate({ ...config(), extra: true }).ok, false);
  assert.equal(validate({ ...config(), extra: new Date() }).ok, false);
});

test('standalone extensions validate Unicode and structured uniqueness with code generation disabled', async () => {
  const directory = await mkdtemp('/tmp/cii-extension-csp-');
  try {
    const filename = `${directory}/validator.mjs`;
    const fragments: ConfigSchemaExtension[] = [
      {
        ...extension,
        settings: {
          type: 'object',
          required: ['name', 'items'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 1 },
            items: {
              type: 'array',
              uniqueItems: true,
              items: { type: 'object' }
            }
          }
        }
      }
    ];
    await writeFile(filename, compileExtendedMapConfigValidator(fragments));
    const original = config();
    const valid = {
      ...original,
      extensions: {
        example: { name: '🌏', items: [{ value: 1 }, { value: 2 }] }
      }
    };
    const duplicate = {
      ...valid,
      extensions: {
        example: { name: '🌏', items: [{ value: 1 }, { value: 1 }] }
      }
    };
    const { stdout } = await promisify(execFile)(process.execPath, [
      '--disallow-code-generation-from-strings',
      '--input-type=module',
      '-e',
      `import validate from ${JSON.stringify(pathToFileURL(filename).href)};
       if (!validate(${JSON.stringify(valid)})) throw new Error('Unicode config rejected');
       if (validate(${JSON.stringify(duplicate)})) throw new Error('Duplicate objects accepted');
       process.stdout.write('validated');`
    ]);
    assert.equal(stdout, 'validated');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
