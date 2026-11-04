import type { ConfirmedCrs } from './types.ts';

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
