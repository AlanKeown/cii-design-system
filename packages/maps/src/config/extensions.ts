import { Ajv } from 'ajv';
import type { AnySchemaObject } from 'ajv';
import { createRequire } from 'node:module';
import type { ValidateFunction } from 'ajv';

import { getMapConfigSchema, validateConfigWith } from './index.ts';
import type { ResolvedMapConfig, SchemaValidator } from './index.ts';
import type { CrsDeclaration } from '../crs/types.ts';
import type { Result } from '../errors.ts';
import { MapError } from '../errors.ts';

const require = createRequire(import.meta.url);
const emitStandalone: (
  ajv: Ajv,
  validator: ValidateFunction
) => string = require('ajv/dist/standalone/index.js');

/** Draft-07 fragments are trusted application code, never downloaded from map configuration. */
export interface ConfigSchemaExtension {
  id: string;
  sources?: readonly {
    id: string;
    crsMode: 'declared' | 'service-metadata' | 'database-metadata';
    properties?: Record<string, AnySchemaObject | boolean>;
    required?: readonly string[];
  }[];
  controls?: readonly {
    id: string;
    properties?: Record<string, AnySchemaObject | boolean>;
    required?: readonly string[];
  }[];
  /** Settings live under extensions[id]; fragments cannot replace core fields. */
  settings?: AnySchemaObject;
}

export type ExtendedMapConfig = Omit<
  ResolvedMapConfig,
  'layers' | 'controls'
> & {
  layers: (Omit<ResolvedMapConfig['layers'][number], 'source'> & {
    source: { provider: string; crs: CrsDeclaration; [key: string]: unknown };
  })[];
  controls?: { id: string; position?: string; [key: string]: unknown }[];
  extensions?: Record<string, unknown>;
};

const invalid = (reason: string) => new MapError('CONFIG_INVALID', { reason });

/** Extend only named slots. Core CRS, attribution and editable-target rules remain in force. */
export function mergeMapConfigSchema(
  extensions: readonly ConfigSchemaExtension[]
): AnySchemaObject {
  const schema: AnySchemaObject = getMapConfigSchema();
  const definitions = schema.definitions;
  const sourceIds = new Set<string>();
  for (const branch of definitions.SourceConfig.oneOf) {
    const provider =
      definitions[branch.$ref.split('/').at(-1)].properties.provider;
    for (const id of provider.enum ?? [provider.const]) sourceIds.add(id);
  }
  const controlIds = new Set<string>(
    definitions.ControlConfig.properties.id.enum
  );
  const extensionIds = new Set<string>();
  const settings: Record<string, AnySchemaObject> = {};
  const claim = (ids: Set<string>, id: string) => {
    if (!/^[a-z][a-z0-9.-]*$/.test(id) || ids.has(id))
      throw invalid('Extension IDs must be unique lowercase names.');
    ids.add(id);
  };
  // Keep fragment references local to the composed schema; never resolve external URLs.
  const inspect = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === '$id' || key === '$schema' || key === '$async')
        throw invalid(
          'Extension fragments cannot change schema identity or dialect.'
        );
      if (
        key === '$ref' &&
        (typeof child !== 'string' || !child.startsWith('#/'))
      )
        throw invalid(
          'Extension schema references must be local JSON pointers.'
        );
      inspect(child);
    }
  };
  for (const extension of extensions) {
    claim(extensionIds, extension.id);
    inspect(extension);
    if (extension.settings)
      settings[extension.id] = structuredClone(extension.settings);
    for (const source of extension.sources ?? []) {
      claim(sourceIds, source.id);
      const properties = structuredClone(source.properties ?? {});
      if ('provider' in properties || 'crs' in properties)
        throw invalid(
          'Source fragments cannot replace provider or CRS confirmation.'
        );
      if (
        !['declared', 'service-metadata', 'database-metadata'].includes(
          source.crsMode
        )
      )
        throw invalid('Extension source requires an explicit CRS policy.');
      const crs =
        source.crsMode === 'declared'
          ? { $ref: '#/definitions/DeclaredCrs' }
          : source.crsMode === 'service-metadata'
            ? { $ref: '#/definitions/MetadataCrs' }
            : {
                oneOf: [
                  { $ref: '#/definitions/DeclaredCrs' },
                  { $ref: '#/definitions/MetadataCrs' }
                ]
              };
      definitions.SourceConfig.oneOf.push({
        type: 'object',
        additionalProperties: false,
        required: [...new Set(['provider', 'crs', ...(source.required ?? [])])],
        properties: { ...properties, provider: { const: source.id }, crs }
      });
    }
    for (const control of extension.controls ?? []) {
      claim(controlIds, control.id);
      const properties = structuredClone(control.properties ?? {});
      if ('id' in properties || 'position' in properties)
        throw invalid(
          'Control fragments cannot replace control identity or placement.'
        );
      // Convert once from the built-in object into a union of independent strict objects.
      if (!definitions.ControlConfig.oneOf) {
        definitions.ControlConfig = { oneOf: [definitions.ControlConfig] };
      }
      definitions.ControlConfig.oneOf.push({
        type: 'object',
        additionalProperties: false,
        required: [...new Set(['id', ...(control.required ?? [])])],
        properties: {
          ...properties,
          id: { const: control.id },
          position: structuredClone(
            getMapConfigSchema().definitions.ControlConfig.properties.position
          )
        }
      });
    }
  }
  if (Object.keys(settings).length) {
    schema.properties.extensions = {
      type: 'object',
      additionalProperties: false,
      properties: settings
    };
  }
  return schema;
}

function compile(extensions: readonly ConfigSchemaExtension[]) {
  const ajv = new Ajv({
    allErrors: true,
    strict: true,
    strictRequired: false,
    useDefaults: true,
    ownProperties: true,
    code: { source: true, esm: true }
  });
  // Core conditionals intentionally require keys defined in the surrounding object.
  const schema = mergeMapConfigSchema(extensions);
  return { ajv, validator: ajv.compile<ExtendedMapConfig>(schema) };
}

/** Build/server helper. Use generated standalone modules in browsers with a strict CSP. */
export function createExtendedMapConfigValidator(
  extensions: readonly ConfigSchemaExtension[]
): (input: unknown) => Result<ExtendedMapConfig> {
  const { validator } = compile(extensions);
  return (input) => validateConfigWith(input, validator);
}

/** Emit an ESM predicate for validateConfigWith(), without a runtime Ajv or eval dependency. */
export function compileExtendedMapConfigValidator(
  extensions: readonly ConfigSchemaExtension[]
): string {
  const { ajv, validator } = compile(extensions);
  // Ajv emits CommonJS references for these two pure runtime helpers, even in ESM mode.
  // Embed their installed implementation so generated output is self-contained.
  return emitStandalone(ajv, validator).replace(
    /require\("ajv\/dist\/runtime\/(ucs2length|equal)"\)\.default/g,
    (_match, helper: string) => {
      const implementation: { default: { toString(): string } } = require(
        `ajv/dist/runtime/${helper}.js`
      );
      return `(${implementation.default.toString()})`;
    }
  );
}

export type ExtendedSchemaValidator = SchemaValidator<ExtendedMapConfig>;
