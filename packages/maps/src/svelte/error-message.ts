import type { MapError } from '../errors.ts';
import type { ConfigIssue } from '../config/index.ts';

/** Task-oriented copy; the original typed error remains available through onerror. */
export function mapErrorMessage(error: MapError): string {
  if (error.details.control === 'coords')
    return 'The coordinate readout could not be calculated. Check the registered readout CRS and whether this position can be transformed into it.';
  switch (error.code) {
    case 'CONFIG_INVALID':
      return 'Some map settings are invalid or unsupported. Check the configuration and correct any settings listed below.';
    case 'SOURCE_INVALID':
      return error.details.provider === 'xyz'
        ? 'The XYZ tile address is invalid. Use an HTTP(S) or relative URL with {z}, {x} and {y} placeholders, then load it again.'
        : 'The layer data could not be read as GeoJSON. Check the file’s format and geometry, then load it again.';
    case 'SOURCE_LOAD_FAILED':
    case 'LAYER_LOAD_FAILED':
      return ['xyz', 'wms', 'wmts'].includes(String(error.details.provider))
        ? 'Some tiles could not be loaded. Check your connection and the tile address, then hide and show the layer to retry.'
        : 'The layer could not be loaded. Check your connection and the data address, then try loading it again.';
    case 'SOURCE_TOO_LARGE':
      if (error.details.provider === 'ogc')
        return 'The capabilities document exceeds 2 MiB. Use a smaller service catalogue or a filtered application endpoint.';
      return 'The layer exceeds the supported data limit. Reduce it to 5 MiB, 10,000 features and 100,000 positions, then load it again.';
    case 'STYLE_UNSUPPORTED':
      return error.details.renderKind === 'raster-tiles'
        ? 'Feature styles cannot be applied to raster tiles. Remove the layer style and use layer opacity instead.'
        : 'The layer style could not be applied. Use supported path or circle styles, import @cii/tokens/tokens.css and check any colour token names.';
    case 'VIEW_INVALID':
      return 'The map position could not be applied. Check the centre coordinates and use a supported zoom or positive resolution without rotation.';
    case 'ATTRIBUTION_REQUIRED':
      return 'The layer needs attribution. Add a non-empty attribution describing the data provider and try again.';
    case 'CRS_HINT_MISMATCH':
      return 'The data’s coordinate system differs from its declaration. Check the source metadata and correct the declared CRS before loading it again.';
    case 'CRS_NOT_CONFIRMED':
    case 'CRS_DECLARATION_NOT_ALLOWED':
    case 'CRS_METADATA_INVALID':
    case 'CRS_NOT_FOUND':
      return 'The source coordinate system could not be confirmed. Check its CRS declaration or service metadata and try again.';
    case 'LAYER_INCOMPATIBLE':
      return 'The layer cannot be displayed on this map. Check its coordinates and choose a layer and display CRS supported by the selected engine.';
    case 'DISPLAY_CRS_UNSUPPORTED':
      return 'The engine does not support this display coordinate system. Choose a supported display CRS and load the map again.';
    case 'DISPLAY_CRS_SWITCH_BLOCKED':
      return 'The engine or display CRS cannot be changed on this map. Remount the map with the new settings.';
    case 'ENGINE_NOT_REGISTERED':
    case 'ENGINE_ID_MISMATCH':
    case 'REGISTRY_NOT_FOUND':
      return 'A required map provider is unavailable. Check the engine, source and renderer registrations, then load the map again.';
    case 'TRANSFORM_COORDINATE_INVALID':
    case 'TRANSFORM_GEOMETRY_INVALID':
      return 'Some coordinates could not be transformed. Check the source geometry and its declared CRS, then load it again.';
    default:
      return 'The map could not complete this change. Check the map settings and source data, then try again. If the problem continues, contact the map provider.';
  }
}

export function mapErrorIssues(error: MapError): readonly ConfigIssue[] {
  if (!Array.isArray(error.details.issues)) return [];
  return error.details.issues.filter(
    (issue): issue is ConfigIssue =>
      !!issue &&
      typeof issue === 'object' &&
      typeof issue.path === 'string' &&
      typeof issue.message === 'string'
  );
}
