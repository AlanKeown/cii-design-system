import { MapError } from '../errors.ts';

/** Approved S4 default. Larger browser imports need explicit OPFS capability and application policy. */
export const DEFAULT_GEOPACKAGE_BROWSER_LIMIT_BYTES = 16 * 1024 * 1024;
export type GeoPackageRoute =
  | { reader: 'browser-memory'; reason: 'within-browser-limit' }
  | { reader: 'browser-opfs'; reason: 'explicit-opfs-override' }
  | { reader: 'server'; reason: 'above-browser-limit' | 'opfs-unavailable' };

/** Selects a reader location, not a provider. Does not parse files or infer/confirm their CRS. */
export function routeGeoPackageFile(
  fileBytes: number,
  options: { opfsAvailable?: boolean; opfsLimitBytes?: number } = {}
): GeoPackageRoute {
  if (
    !Number.isSafeInteger(fileBytes) ||
    fileBytes <= 0 ||
    (options.opfsLimitBytes !== undefined &&
      (!Number.isSafeInteger(options.opfsLimitBytes) ||
        options.opfsLimitBytes <= 0))
  ) {
    throw new MapError('SOURCE_INVALID', {
      reason:
        'File size and configured OPFS limit must be positive safe-integer byte counts.'
    });
  }
  if (fileBytes <= DEFAULT_GEOPACKAGE_BROWSER_LIMIT_BYTES)
    return { reader: 'browser-memory', reason: 'within-browser-limit' };
  if (
    options.opfsLimitBytes !== undefined &&
    fileBytes <= options.opfsLimitBytes
  ) {
    return options.opfsAvailable
      ? { reader: 'browser-opfs', reason: 'explicit-opfs-override' }
      : { reader: 'server', reason: 'opfs-unavailable' };
  }
  return { reader: 'server', reason: 'above-browser-limit' };
}
