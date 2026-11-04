export type CrsCode = string;
export type Coord = readonly [number, number];
export type Extent = readonly [number, number, number, number];

export interface CrsRef {
  code: CrsCode;
  wkt?: string;
  axisOrder: 'xy' | 'yx';
  epoch?: number;
}

export interface CrsHint {
  code?: CrsCode;
  wkt?: string;
  from:
    | 'prj'
    | 'gpkg_spatial_ref_sys'
    | 'spatialite_spatial_ref_sys'
    | 'flatgeobuf_header'
    | 'rfc7946_default'
    | 'kml_spec'
    | 'gpx_spec'
    | 'none';
}

export type CrsProvenance =
  | { kind: 'service-metadata'; url: string; element: string }
  | { kind: 'database-metadata'; table: string; column: string; srid: number }
  | {
      kind: 'declared';
      by: string;
      hint?: CrsHint;
      hintMismatchAcknowledged?: boolean;
    };

export interface ConfirmedCrs {
  crs: CrsRef;
  provenance: CrsProvenance;
  confirmedAt: string;
}

export type CrsSelectionPolicy = 'prefer-display' | 'prefer-native';
export type CrsDeclaration =
  | {
      code: CrsCode;
      axisOrder?: 'xy' | 'yx';
      provenance: { kind: 'declared'; by: string };
    }
  | { fromMetadata: true; policy?: CrsSelectionPolicy };

export interface TileMatrix {
  origin: Coord;
  /** Positive, strictly descending display units per CSS pixel. */
  resolutions: readonly number[];
}

export interface CrsDef {
  code: CrsCode;
  name: string;
  proj4: string;
  units: 'metres' | 'degrees';
  projected: boolean;
  geographicBase: CrsCode;
  /** Geodetic identity, not an ellipsoid name. Missing metadata means unknown datum. */
  datum?: GeodeticDatum;
  /** Geographic area of use in longitude/latitude, not a projected tile extent. */
  areaOfUse: Extent;
  tileMatrix?: TileMatrix;
}

export interface GeodeticDatum {
  id: string;
  name: string;
  kind: 'static' | 'dynamic' | 'ensemble';
  referenceEpoch?: number;
}

export interface CrsDefinitionProvider {
  resolve(code: CrsCode): CrsDef | undefined | Promise<CrsDef | undefined>;
}
