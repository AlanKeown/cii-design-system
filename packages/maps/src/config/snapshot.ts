import { validateMapConfig } from './index.ts';
import { isJson } from './json.ts';
import { isConfirmedCrs } from '../crs/confirmation.ts';
import type { MapConfig } from './types.ts';
import type { ConfirmedCrs } from '../crs/types.ts';
import { MapError } from '../errors.ts';

/** Historical inspection data. Never accepted as source-confirmation authority. */
export interface MapConfigSnapshot {
  version: 1;
  config: MapConfig;
  provenance: {
    id: string;
    origin: 'config' | 'declarative';
    crs: ConfirmedCrs;
  }[];
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function confirmed(value: unknown): value is ConfirmedCrs {
  if (!isConfirmedCrs(value)) return false;
  if (value.provenance.kind !== 'declared') return true;
  const { hint, hintMismatchAcknowledged } = value.provenance;
  return (
    (hintMismatchAcknowledged === undefined ||
      typeof hintMismatchAcknowledged === 'boolean') &&
    (hint === undefined ||
      (record(hint) &&
        [
          'prj',
          'geojson_crs',
          'gpkg_spatial_ref_sys',
          'spatialite_spatial_ref_sys',
          'flatgeobuf_header',
          'rfc7946_default',
          'kml_spec',
          'gpx_spec',
          'none'
        ].includes(String(hint.from)) &&
        (hint.code === undefined || typeof hint.code === 'string') &&
        (hint.wkt === undefined || typeof hint.wkt === 'string')))
  );
}

/** Validate and detach a versioned JSON snapshot, without confirming any sources. */
export function validateMapConfigSnapshot(input: unknown): MapConfigSnapshot {
  let json = false;
  try {
    json = isJson(input);
  } catch {
    // Object inspection can throw (for example, a revoked Proxy).
  }
  if (
    !json ||
    !record(input) ||
    input.version !== 1 ||
    Object.keys(input).some(
      (key) => !['version', 'config', 'provenance'].includes(key)
    ) ||
    !Array.isArray(input.provenance)
  )
    throw new MapError('CONFIG_INVALID', {
      reason: 'Expected a version 1 map configuration snapshot.'
    });
  const config = validateMapConfig(input.config);
  if (!config.ok) throw config.error;
  const ids = new Set<string>();
  for (const entry of input.provenance) {
    if (
      !record(entry) ||
      typeof entry.id !== 'string' ||
      !entry.id.trim() ||
      ids.has(entry.id) ||
      !['config', 'declarative'].includes(String(entry.origin)) ||
      Object.keys(entry).some(
        (key) => !['id', 'origin', 'crs'].includes(key)
      ) ||
      !confirmed(entry.crs) ||
      (entry.origin === 'config') !==
        config.value.layers.some((layer) => layer.id === entry.id)
    )
      throw new MapError('CONFIG_INVALID', {
        reason: 'Invalid snapshot provenance entry.'
      });
    ids.add(entry.id);
  }
  if (config.value.layers.some((layer) => !ids.has(layer.id)))
    throw new MapError('CONFIG_INVALID', {
      reason: 'Snapshot requires provenance for every configured layer.'
    });
  return {
    version: 1,
    config: config.value,
    provenance: structuredClone(
      input.provenance
    ) as MapConfigSnapshot['provenance']
  };
}

/** Restore declarations/policies only. Mount with a fresh runtime to re-probe sources. */
export function restoreMapConfigSnapshot(input: unknown): MapConfig {
  return validateMapConfigSnapshot(input).config;
}
