// Generated from map.schema.json. Run npm run generate:config -w @cii/maps.

export type NonEmptyString = string;
export type ViewConfig = ViewConfig1 & {
  center: {
    crs: NonEmptyString;
    coordinates: Coord;
  };
  resolution?: number;
  zoom?: number;
  rotation?: number;
  minZoom?: number;
  maxZoom?: number;
  minResolution?: number;
  maxResolution?: number;
};
export type ViewConfig1 =
  | {
      resolution: number;
    }
  | {
      zoom: number;
    };
/**
 * @minItems 2
 * @maxItems 2
 */
export type Coord = [number, number];
export type LayerConfig = {
  id: NonEmptyString;
  source: SourceConfig;
  attribution?: NonEmptyString;
  visible?: boolean;
  opacity?: number;
  order?: number;
  editable?: boolean;
  style?: BaseStyle;
};
export type SourceConfig =
  | TileSourceConfig
  | ServiceSourceConfig
  | FileSourceConfig
  | InlineSourceConfig
  | PostgisSourceConfig;

export interface MapConfig {
  engine: NonEmptyString;
  label?: NonEmptyString;
  description?: string;
  display?: {
    crs?: string;
    allowExperimental?: boolean;
  };
  view: ViewConfig;
  layers: LayerConfig[];
  controls?: ControlConfig[];
  capture?: CaptureConfig;
}
export interface TileSourceConfig {
  provider: 'xyz' | 'tms' | 'tilejson' | 'mvt' | 'pmtiles';
  url: NonEmptyString;
  crs: DeclaredCrs;
}
export interface DeclaredCrs {
  code: NonEmptyString;
  axisOrder?: 'xy' | 'yx';
  provenance: {
    kind: 'declared';
    by: NonEmptyString;
  };
}
export interface ServiceSourceConfig {
  provider: 'wms' | 'wmts' | 'wfs' | 'oapif' | 'arcgis-rest';
  url: NonEmptyString;
  crs: MetadataCrs;
  layers?: NonEmptyString;
  layer?: NonEmptyString;
  version?: NonEmptyString;
  matrixSet?: NonEmptyString;
  collection?: NonEmptyString;
  typeName?: NonEmptyString;
}
export interface MetadataCrs {
  fromMetadata: true;
  policy?: 'prefer-display' | 'prefer-native';
}
export interface FileSourceConfig {
  provider:
    | 'geojson'
    | 'gpkg'
    | 'spatialite'
    | 'shapefile'
    | 'kml'
    | 'gpx'
    | 'csv'
    | 'flatgeobuf'
    | 'cog';
  url: NonEmptyString;
  table?: NonEmptyString;
  crs: DeclaredCrs;
}
export interface InlineSourceConfig {
  provider: 'inline';
  data: {};
  crs: DeclaredCrs;
}
export interface PostgisSourceConfig {
  provider: 'postgis';
  target: TargetRef;
  crs: DeclaredCrs | MetadataCrs;
}
export interface TargetRef {
  schema: NonEmptyString;
  table: NonEmptyString;
}
export interface BaseStyle {
  stroke?: {
    color: NonEmptyString;
    width: number;
    /**
     * @minItems 1
     */
    dash?: [number, ...number[]];
    opacity?: number;
  };
  fill?: {
    color: NonEmptyString;
    opacity?: number;
  };
  point?:
    | {
        shape: 'circle' | 'square' | 'triangle';
        size: number;
      }
    | {
        icon: NonEmptyString;
        size: number;
      };
  label?: {
    field: NonEmptyString;
    size: number;
    color: NonEmptyString;
    halo?: NonEmptyString;
  };
  legendLabel?: NonEmptyString;
}
export interface ControlConfig {
  id:
    | 'zoom'
    | 'home'
    | 'rotate'
    | 'scale'
    | 'attribution'
    | 'coords'
    | 'layer-list'
    | 'legend'
    | 'feature-list'
    | 'basemap-picker'
    | 'display-crs'
    | 'identify'
    | 'geolocate'
    | 'draw'
    | 'edit'
    | 'snap'
    | 'coordinate-input'
    | 'vertex-list'
    | 'capture-status'
    | 'commit'
    | 'measure'
    | 'import';
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  readoutCrs?: NonEmptyString;
}
export interface CaptureConfig {
  target: NonEmptyString;
  persistence: NonEmptyString;
  /**
   * @minItems 1
   */
  modes: [
    (
      | 'point'
      | 'linestring'
      | 'polygon'
      | 'rectangle'
      | 'select'
      | 'modify'
      | 'move'
      | 'delete'
      | 'split'
      | 'merge'
      | 'reshape'
      | 'trace'
      | 'circle'
    ),
    ...(
      | 'point'
      | 'linestring'
      | 'polygon'
      | 'rectangle'
      | 'select'
      | 'modify'
      | 'move'
      | 'delete'
      | 'split'
      | 'merge'
      | 'reshape'
      | 'trace'
      | 'circle'
    )[]
  ];
  snap?: {
    /**
     * @minItems 1
     */
    layers: [string, ...string[]];
    tolerancePx: number;
  };
  validity?: 'reject' | 'make-valid';
  allowNonConformantPersistence?: boolean;
}
