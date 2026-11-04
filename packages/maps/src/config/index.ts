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
}

/** Returns a fresh schema so callers cannot mutate another map's contract. */
export function getMapConfigSchema(): typeof schema {
  return structuredClone(schema);
}

// Configs cross a JSON boundary; reject cycles, functions, Dates and non-finite numbers
// rather than silently losing/coercing values with a JSON stringify/parse round trip.
function isJson(
  value: unknown,
  ancestors = new Set<object>(),
  depth = 0
): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || depth > 128 || ancestors.has(value))
    return false;
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).some(
      (key) =>
        typeof key !== 'string' ||
        (!(Array.isArray(value) && key === 'length') &&
          (!descriptors[key].enumerable || !('value' in descriptors[key])))
    )
  )
    return false;
  if (Array.isArray(value) && Object.keys(value).length !== value.length)
    return false;
  ancestors.add(value);
  const children = Array.isArray(value) ? value : Object.values(value);
  const valid = Array.from(children).every((child) =>
    isJson(child, ancestors, depth + 1)
  );
  ancestors.delete(value);
  return valid;
}

function formatErrors(errors: readonly ConfigValidationError[]): ConfigIssue[] {
  // Report structural diagnostics only; never include submitted values in errors.
  return errors.map((error) => ({
    path: error.instancePath || '/',
    message: error.message ?? 'Invalid setting.'
  }));
}

function referenceIssues(config: ResolvedMapConfig): ConfigIssue[] {
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
  if (!validate(copy)) {
    const errors = validate.errors ?? [];
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
