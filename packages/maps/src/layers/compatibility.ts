import type { ConfirmedCrs, Coord, CrsDef, TileMatrix } from '../crs/types.ts';
import type { EngineCapabilities, PortableStyle } from '../engine/types.ts';
import type { LayerSpec, SourceSpatialSupport } from './types.ts';
import { MapError } from '../errors.ts';

/** Runtime guard in addition to the compile-time SourceSpec boundary (R1.1). */
export function isConfirmedCrs(value: unknown): value is ConfirmedCrs {
  if (
    !value ||
    typeof value !== 'object' ||
    !('crs' in value) ||
    !('provenance' in value) ||
    !('confirmedAt' in value)
  )
    return false;
  const { crs, provenance, confirmedAt } = value;
  if (
    !crs ||
    typeof crs !== 'object' ||
    !('code' in crs) ||
    typeof crs.code !== 'string' ||
    !crs.code.trim() ||
    !('axisOrder' in crs) ||
    (crs.axisOrder !== 'xy' && crs.axisOrder !== 'yx')
  )
    return false;
  if (
    ('wkt' in crs && crs.wkt !== undefined && typeof crs.wkt !== 'string') ||
    ('epoch' in crs &&
      crs.epoch !== undefined &&
      (typeof crs.epoch !== 'number' || !Number.isFinite(crs.epoch)))
  )
    return false;
  if (
    typeof confirmedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T/.test(confirmedAt) ||
    !Number.isFinite(Date.parse(confirmedAt))
  )
    return false;
  if (!provenance || typeof provenance !== 'object' || !('kind' in provenance))
    return false;
  const nonblank = (v: unknown) => typeof v === 'string' && !!v.trim();
  switch (provenance.kind) {
    case 'declared':
      return 'by' in provenance && nonblank(provenance.by);
    case 'service-metadata':
      return (
        'url' in provenance &&
        nonblank(provenance.url) &&
        'element' in provenance &&
        nonblank(provenance.element)
      );
    case 'database-metadata':
      return (
        'table' in provenance &&
        nonblank(provenance.table) &&
        'column' in provenance &&
        nonblank(provenance.column) &&
        'srid' in provenance &&
        typeof provenance.srid === 'number' &&
        Number.isInteger(provenance.srid) &&
        provenance.srid > 0
      );
    default:
      return false;
  }
}

function validGrid(grid: TileMatrix): boolean {
  return (
    grid.origin.length === 2 &&
    Array.from(grid.origin).every(Number.isFinite) &&
    grid.resolutions.length >= 2 &&
    Array.from(grid.resolutions).every(
      (resolution, i) =>
        Number.isFinite(resolution) &&
        resolution > 0 &&
        (i === 0 || resolution < grid.resolutions[i - 1])
    )
  );
}

export function isSourceSpatialSupport(
  value: unknown
): value is SourceSpatialSupport {
  if (!value || typeof value !== 'object' || !('type' in value)) return false;
  switch (value.type) {
    case 'features':
    case 'image':
      return true;
    case 'service':
    case 'custom':
      return (
        'supportedCrs' in value &&
        Array.isArray(value.supportedCrs) &&
        value.supportedCrs.length > 0 &&
        value.supportedCrs.every(
          (code) => typeof code === 'string' && !!code.trim()
        )
      );
    case 'fixed-grid': {
      if (
        !('crs' in value) ||
        typeof value.crs !== 'string' ||
        !value.crs.trim() ||
        !('grid' in value) ||
        !value.grid ||
        typeof value.grid !== 'object'
      )
        return false;
      const grid = value.grid;
      return (
        'origin' in grid &&
        Array.isArray(grid.origin) &&
        'resolutions' in grid &&
        Array.isArray(grid.resolutions) &&
        validGrid({
          origin: grid.origin as unknown as Coord,
          resolutions: grid.resolutions
        })
      );
    }
    default:
      return false;
  }
}

function gridsMatch(
  source: TileMatrix,
  display: TileMatrix | undefined
): boolean {
  if (!display || !validGrid(source) || !validGrid(display)) return false;
  const near = (a: number, b: number) =>
    Math.abs(a - b) <=
    Number.EPSILON * 32 * Math.max(1, Math.abs(a), Math.abs(b));
  return (
    source.origin.every((value, i) => near(value, display.origin[i])) &&
    source.resolutions.every((value) =>
      display.resolutions.some((level) => near(value, level))
    )
  );
}

export function spatialIncompatibility(
  spec: LayerSpec,
  display: CrsDef,
  capabilities: EngineCapabilities
): string | undefined {
  const { source } = spec;
  if (!capabilities.renderKinds.has(source.renderKind))
    return `Engine cannot render ${source.renderKind}.`;
  const spatial = source.spatial;
  const allowed: Record<string, readonly SourceSpatialSupport['type'][]> = {
    features: ['features'],
    'raster-tiles': ['fixed-grid', 'service'],
    'raster-image': ['image', 'service'],
    'vector-tiles': ['fixed-grid']
  };
  const allowedTypes = Object.hasOwn(allowed, source.renderKind)
    ? allowed[source.renderKind]
    : ['custom'];
  if (!allowedTypes.includes(spatial.type))
    return 'Spatial support does not match the render kind.';
  switch (spatial.type) {
    case 'features':
      return source.renderKind === 'features'
        ? undefined
        : 'Feature spatial support requires the features render kind.';
    case 'fixed-grid': {
      if (!['raster-tiles', 'vector-tiles'].includes(source.renderKind))
        return 'A fixed grid requires a tile render kind.';
      if (spatial.crs !== source.crs.crs.code)
        return 'Tile grid CRS differs from the confirmed source CRS.';
      if (!validGrid(spatial.grid)) return 'Invalid source tile grid.';
      if (
        spatial.crs === display.code &&
        gridsMatch(spatial.grid, display.tileMatrix)
      )
        return undefined;
      if (
        source.renderKind === 'raster-tiles' &&
        capabilities.rasterReprojection
      )
        return undefined;
      return 'Tile CRS and grid must match the display CRS and grid.';
    }
    case 'service': {
      if (!['raster-tiles', 'raster-image'].includes(source.renderKind))
        return 'Raster service support requires a raster render kind.';
      if (!spatial.supportedCrs.includes(source.crs.crs.code))
        return 'Service does not advertise the confirmed source CRS.';
      return spatial.supportedCrs.includes(display.code) ||
        capabilities.rasterReprojection
        ? undefined
        : 'Service does not advertise the display CRS.';
    }
    case 'image':
      return source.renderKind !== 'raster-image'
        ? 'Image spatial support requires raster-image.'
        : source.crs.crs.code === display.code ||
            capabilities.rasterReprojection
          ? undefined
          : 'Engine cannot reproject the image into the display CRS.';
    case 'custom':
      return spatial.supportedCrs.includes(display.code)
        ? undefined
        : 'Source does not support the display CRS.';
  }
}

export function assertStyle(
  style: PortableStyle | undefined,
  capabilities: EngineCapabilities
): void {
  if (!style) return;
  for (const entry of [
    style,
    ...(style.rules?.map((rule) => rule.style) ?? [])
  ]) {
    const required = [
      entry.stroke?.dash ? 'dash' : undefined,
      entry.label ? 'label' : undefined,
      entry.label?.halo ? 'halo-label' : undefined,
      entry.point && 'icon' in entry.point ? 'icon' : undefined
    ];
    const missing = required.filter(
      (feature) =>
        feature !== undefined && !capabilities.styleFeatures.has(feature)
    );
    if (missing.length)
      throw new MapError('STYLE_UNSUPPORTED', { features: missing });
  }
}

export function layerIdentityKey(spec: LayerSpec): string {
  return JSON.stringify([
    spec.id,
    spec.source.provider,
    spec.source.identity,
    spec.source.renderKind,
    spec.source.crs.crs.code,
    spec.source.crs.crs.axisOrder,
    spec.source.crs.crs.epoch,
    spec.source.crs.crs.wkt
  ]);
}
