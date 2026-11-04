export type MapErrorCode =
  | 'CONFIG_INVALID'
  | 'ATTRIBUTION_REQUIRED'
  | 'REGISTRY_DUPLICATE'
  | 'REGISTRY_NOT_FOUND'
  | 'CRS_NOT_FOUND'
  | 'CRS_NOT_CONFIRMED'
  | 'CRS_HINT_MISMATCH'
  | 'CRS_DECLARATION_NOT_ALLOWED'
  | 'CRS_METADATA_INVALID'
  | 'VIEW_INVALID';

export class MapError extends Error {
  readonly code: MapErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: MapErrorCode, details: Record<string, unknown> = {}) {
    super(`${code}: ${JSON.stringify(details)}`);
    this.name = 'MapError';
    this.code = code;
    this.details = details;
  }
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: MapError };
