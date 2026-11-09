import { isJson } from './json.ts';
import validate from './compiled-validator.js';
import type { ConfigValidationError } from './compiled-validator.js';
import schema from './map.schema.json' with { type: 'json' };
import { MapError } from '../errors.ts';
import type { Result } from '../errors.ts';
import type { MapConfig } from './types.ts';

export type {
  MapConfig,
  SourceConfig,
  LayerConfig,
  ControlConfig,
  CaptureConfig,
  ViewConfig
} from './types.ts';

export type ResolvedMapConfig = Omit<MapConfig, 'display'> & {
  display: { crs: string; allowExperimental: boolean };
};

export interface ConfigIssue {
  path: string;
  message: string;
  action?: string;
}

/** Returns a fresh schema so callers cannot mutate another map's contract. */
export function getMapConfigSchema(): typeof schema {
  return structuredClone(schema);
}

function formatErrors(errors: readonly ConfigValidationError[]): ConfigIssue[] {
  // Report structural diagnostics only; never include submitted values in errors.
  const actions: Record<string, string> = {
    required: 'Add this required setting.',
    additionalProperties: 'Remove this unsupported setting.',
    type: 'Use the expected value type.',
    enum: 'Choose one of the supported values.',
    const: 'Use the required value.',
    minimum: 'Increase the value to the stated minimum.',
    exclusiveMinimum: 'Use a value greater than the stated minimum.',
    maximum: 'Reduce the value to the stated maximum.',
    minLength: 'Enter a non-empty value.',
    pattern: 'Use the required format.',
    minItems: 'Add the required entries.',
    maxItems: 'Remove the extra entries.'
  };
  return errors.map((error) => {
    const property =
      error.keyword === 'required'
        ? error.params.missingProperty
        : error.keyword === 'additionalProperties'
          ? error.params.additionalProperty
          : undefined;
    const suffix =
      typeof property === 'string'
        ? `/${property.replace(/~/g, '~0').replace(/\//g, '~1')}`
        : '';
    return {
      path: `${error.instancePath}${suffix}` || '/',
      message: error.message ?? 'Invalid setting.',
      action:
        actions[error.keyword] ??
        'Update this setting to match the map configuration schema.'
    };
  });
}

export interface ConfigEnvelope {
  view: ResolvedMapConfig['view'];
  layers: readonly { id: string; editable?: boolean }[];
  capture?: ResolvedMapConfig['capture'];
}

export interface SchemaValidator<T> {
  (input: unknown): input is T;
  errors?: readonly ConfigValidationError[] | null;
}

function referenceIssues(config: ConfigEnvelope): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const ids = new Set<string>();
  config.layers.forEach((layer, index) => {
    if (ids.has(layer.id))
      issues.push({
        path: `/layers/${index}/id`,
        message: 'Layer IDs must be unique.'
      });
    ids.add(layer.id);
  });
  if (config.capture) {
    const target = config.layers.find(
      (layer) => layer.id === config.capture?.target
    );
    if (!target?.editable)
      issues.push({
        path: '/capture/target',
        message: 'Capture target must name an editable PostGIS layer.'
      });
    config.capture.snap?.layers.forEach((id, index) => {
      if (!ids.has(id))
        issues.push({
          path: `/capture/snap/layers/${index}`,
          message: 'Snap layer does not exist.'
        });
    });
  }
  for (const [min, max] of [
    [config.view.minZoom, config.view.maxZoom],
    [config.view.minResolution, config.view.maxResolution]
  ]) {
    if (min !== undefined && max !== undefined && min > max)
      issues.push({
        path: '/view',
        message: 'View minimum must not exceed maximum.'
      });
  }
  return issues;
}

/** Validate before probing sources. Applies schema defaults to a copy, never to the caller. */
export function validateMapConfig(input: unknown): Result<ResolvedMapConfig> {
  return validateConfigWith(input, validate);
}

/** Reuse JSON-boundary and cross-reference checks with an extension-aware compiled schema. */
export function validateConfigWith<T extends ConfigEnvelope>(
  input: unknown,
  validator: SchemaValidator<T>
): Result<T> {
  let copy: unknown;
  try {
    if (!isJson(input)) throw new Error('Non-JSON configuration.');
    copy = structuredClone(input);
  } catch {
    return {
      ok: false,
      error: new MapError('CONFIG_INVALID', {
        issues: [
          {
            path: '/',
            message:
              'Configuration must contain only JSON values, with nesting at most 128 levels.'
          }
        ]
      })
    };
  }
  if (!validator(copy)) {
    const errors = validator.errors ?? [];
    const attribution = errors.some(
      (error) =>
        (error.keyword === 'required' &&
          error.params.missingProperty === 'attribution') ||
        /^\/layers\/\d+\/attribution$/.test(error.instancePath)
    );
    return {
      ok: false,
      error: new MapError(
        attribution ? 'ATTRIBUTION_REQUIRED' : 'CONFIG_INVALID',
        { issues: formatErrors(errors) }
      )
    };
  }
  const issues = referenceIssues(copy);
  if (issues.length)
    return { ok: false, error: new MapError('CONFIG_INVALID', { issues }) };
  return { ok: true, value: copy };
}
