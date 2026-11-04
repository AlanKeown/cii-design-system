import { MapError } from '@cii/maps';
import type { ProbeResult } from '@cii/maps';

export interface GeometryColumnMetadata {
  schema: string;
  table: string;
  column: string;
  srid: number;
  /** Authority from spatial_ref_sys; SRID is not necessarily an EPSG code. */
  authority?: { name: string; code: number };
}

/** Converts an authorised geometry_columns query result; does not connect to a database. */
export function probeGeometryColumn(
  metadata: GeometryColumnMetadata
): ProbeResult {
  if (
    !metadata.schema.trim() ||
    !metadata.table.trim() ||
    !metadata.column.trim() ||
    !Number.isInteger(metadata.srid) ||
    metadata.srid < 0
  ) {
    throw new MapError('CRS_METADATA_INVALID', { metadata });
  }
  if (metadata.srid === 0) return { kind: 'hint' };
  if (
    !metadata.authority?.name.trim() ||
    !Number.isInteger(metadata.authority.code) ||
    metadata.authority.code <= 0
  ) {
    throw new MapError('CRS_METADATA_INVALID', {
      reason:
        'Read the authority from spatial_ref_sys; do not assume SRID equals EPSG.'
    });
  }
  const code = `${metadata.authority.name}:${metadata.authority.code}`;
  return {
    kind: 'metadata',
    nativeCode: code,
    candidates: [
      {
        crs: { code, axisOrder: 'xy' },
        provenance: {
          kind: 'database-metadata',
          table: `${metadata.schema}.${metadata.table}`,
          column: metadata.column,
          srid: metadata.srid
        }
      }
    ]
  };
}
