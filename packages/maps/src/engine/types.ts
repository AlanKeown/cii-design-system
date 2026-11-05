import type { ConfirmedCrs, Coord, CrsDef, Extent } from '../crs/types.ts';
import type { MapError } from '../errors.ts';
import type { EngineView, ViewState } from '../view.ts';
import type { BaseStyle } from '../config/types.ts';

export type EngineId = 'leaflet' | 'maplibre' | 'openlayers' | (string & {});
export type RenderKind =
  'features' | 'raster-tiles' | 'raster-image' | 'vector-tiles' | (string & {});
export type StyleFeature =
  'dash' | 'label' | 'halo-label' | 'icon' | 'pattern-fill' | (string & {});
export type Pixel = Coord;
export type Position = readonly [number, number, ...number[]];
export type Geometry =
  | { type: 'Point'; coordinates: Position }
  | { type: 'MultiPoint' | 'LineString'; coordinates: readonly Position[] }
  | {
      type: 'MultiLineString' | 'Polygon';
      coordinates: readonly (readonly Position[])[];
    }
  | {
      type: 'MultiPolygon';
      coordinates: readonly (readonly (readonly Position[])[])[];
    }
  | { type: 'GeometryCollection'; geometries: readonly Geometry[] };

export interface MapFeature {
  type: 'Feature';
  id?: string | number;
  geometry: Geometry | null;
  properties: Readonly<Record<string, unknown>>;
}

/** Transport shape only; coordinates use the explicitly named CRS, not implicit WGS84. */
export interface FeatureBatch {
  type: 'FeatureCollection';
  features: readonly MapFeature[];
}

export type Filter =
  | {
      op: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte';
      field: string;
      value: string | number | boolean | null;
    }
  | { op: 'all' | 'any'; filters: readonly Filter[] }
  | { op: 'not'; filter: Filter };

export type PortableStyle = BaseStyle & {
  rules?: readonly { when: Filter; style: BaseStyle; label: string }[];
  [key: `x-${string}`]: unknown;
};

export interface EngineCapabilities {
  displayCrs(code: string): 'native' | 'experimental' | 'unsupported';
  renderKinds: ReadonlySet<RenderKind>;
  rasterReprojection: boolean;
  rotation: boolean;
  styleFeatures: ReadonlySet<StyleFeature>;
}

export interface EngineInit {
  displayCrs: CrsDef;
  /** Coordinates already transformed into display CRS by core. */
  view?: Partial<
    Pick<ViewState, 'center' | 'resolution' | 'zoom' | 'rotation'>
  >;
  allowExperimental?: boolean;
  signal?: AbortSignal;
}

export interface ResolvedLayer {
  id: string;
  renderKind: RenderKind;
  /** Renderer-owned engine input; features renderers must produce FeatureBatch. */
  data: unknown;
  displayCrs: string;
  sourceCrs: ConfirmedCrs;
  visible: boolean;
  opacity: number;
  order: number;
  style?: PortableStyle;
  attribution?: string;
}

export interface LayerHandle {
  setVisible(visible: boolean): void;
  setOpacity(opacity: number): void;
  setOrder(index: number): void;
  setStyle(style: PortableStyle): void;
  setData?(data: FeatureBatch): void;
  /** Idempotent, including after engine destruction. */
  remove(): void;
}

export interface MapPointerEvent {
  type: 'down' | 'move' | 'up' | 'click' | 'dblclick' | 'contextmenu';
  pixel: Pixel;
  coord: Coord;
  pointerType: 'mouse' | 'pen' | 'touch';
  buttons: number;
  modifiers: { alt: boolean; ctrl: boolean; meta: boolean; shift: boolean };
  originalEvent?: MouseEvent | PointerEvent;
  preventDefault(): void;
}

export interface FeatureHit {
  layerId: string;
  feature: MapFeature;
  distancePx: number;
}

export interface SketchRenderer {
  setData(data: FeatureBatch, style?: PortableStyle): void;
  clear(): void;
  remove(): void;
}

export type NavigationGesture =
  'dragPan' | 'dblClickZoom' | 'boxZoom' | 'keyboard';
export interface InteractionSurface {
  onPointer(handler: (event: MapPointerEvent) => void): () => void;
  onKey(handler: (event: KeyboardEvent) => void): () => void;
  setCursor(cursor: string | null): void;
  /** Nested suspensions are reference counted; each release is idempotent. */
  suspend(navigation: NavigationGesture[]): () => void;
  sketch(): SketchRenderer;
  hitTest(
    pixel: Pixel,
    options: { layers?: string[]; tolerancePx: number }
  ): FeatureHit[];
}

export interface EngineEvents {
  ready: undefined;
  viewchange: { view: ViewState; source: 'api' | 'user' };
  resize: { width: number; height: number };
  error: MapError;
  destroy: undefined;
}

/** Engine code may use browser APIs only during mount, never at module import. */
export interface IMapEngine extends EngineView {
  readonly id: EngineId;
  readonly capabilities: EngineCapabilities;
  mount(container: HTMLElement, init: EngineInit): Promise<void>;
  reconfigure?(change: {
    displayCrs?: CrsDef;
  }): Promise<'done' | 'rebuild-required'>;
  destroy(): void;
  resize(): void;
  /** Defaults to an API event; external map controls may identify user navigation. */
  setView(
    view: Partial<ViewState>,
    options?: { animate?: boolean; source?: 'api' | 'user' }
  ): void;
  fitExtent(
    extent: Extent,
    options?: { padding?: number; maxZoom?: number }
  ): void;
  addLayer(layer: ResolvedLayer): LayerHandle;
  readonly interaction: InteractionSurface;
  on<K extends keyof EngineEvents>(
    type: K,
    callback: (event: EngineEvents[K]) => void
  ): () => void;
  native<T = unknown>(): T;
}

export type EngineConstructor = new () => IMapEngine;
export type EngineLoader = () => Promise<{ default: EngineConstructor }>;
