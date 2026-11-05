export type MapErrorCode =
  | 'TARGET_AUDIT_INVALID'
  | 'TARGET_CAPABILITY_UNSUPPORTED'
  | 'SOURCE_INVALID'
  | 'SOURCE_LOAD_FAILED'
  | 'SOURCE_TOO_LARGE'
  | 'MAP_CONTEXT_MISSING'
  | 'TRANSFORM_DEFINITION_INVALID'
  | 'TRANSFORM_COORDINATE_INVALID'
  | 'TRANSFORM_GEOMETRY_INVALID'
  | 'TRANSFORM_GRID_UNSUPPORTED'
  | 'TRANSFORM_DATUM_POLICY'
  | 'TRANSFORM_REQUEST_INVALID'
  | 'TRANSFORM_FAILED'
  | 'ENGINE_NOT_REGISTERED'
  | 'ENGINE_ID_MISMATCH'
  | 'ENGINE_STATE'
  | 'ENGINE_MOUNT_ABORTED'
  | 'DISPLAY_CRS_UNSUPPORTED'
  | 'DISPLAY_CRS_SWITCH_BLOCKED'
  | 'LAYER_INCOMPATIBLE'
  | 'LAYER_DUPLICATE'
  | 'LAYER_REMOVED'
  | 'LAYER_LOAD_FAILED'
  | 'LAYER_IDENTITY_CHANGED'
  | 'LAYER_INVALID'
  | 'STYLE_UNSUPPORTED'
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
