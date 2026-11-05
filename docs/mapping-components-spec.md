# CII Mapping Components — Development Specification (v0.1)

> **Superseded.** This specification is replaced by [svelte-mapping-components-development-plan.md](./svelte-mapping-components-development-plan.md) (v0.3). Where the two disagree, the plan wins. The parts of this document that still apply have been folded into the plan; see its "Status of the earlier specification" section. This document is kept for reference only.
>
> **API names have changed.** The container component described here as `<CiiMap>`, imported from `@cii/maps`, is implemented as `MapContainer` and imported from `@cii/maps/svelte`. Its props follow the plan (§12.2), not §7 of this document. Review the implementation against the plan and the Map component page on the documentation site (`/components/map/`), not against the examples here.

This specification describes how to build the CII mapping components. It covers simple maps that combine several data sources, through to capturing and editing spatial data. The components run on three open-source map engines, **Leaflet**, **MapLibre GL JS** and **OpenLayers**, behind one typed Svelte 5 API.

It is written for the engineers who will build the `@cii/maps` package and for the designers and reviewers who accept it. It sits alongside [product-design-spec.md](./product-design-spec.md); where that document sets rules (accessibility, tokens, feedback states, audit), this one applies them to maps rather than repeating them.

Repository rules in `AGENTS.md` apply throughout. All authored code, including the snippets in this document, is TypeScript: `<script lang="ts">`, `.ts` modules, `.svelte.ts` for shared reactive state, `strict: true`, `allowJs: false`.

---

## 1) Purpose, scope and capability tiers

### 1.1 Goal

Product teams should be able to put a map in an application by writing configuration, not engine code. They should be able to switch the engine without rewriting the application, and grow from a read-only map to a data capture form using the same components.

### 1.2 Capability tiers

Work is organised into four tiers. Each tier builds on the one before and has its own acceptance criteria (§16).

| Tier | Name                 | What it delivers                                                                                                        |
| ---- | -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| T0   | Display              | One basemap, a controlled view (centre, zoom), zoom and scale controls, attribution, loading and error states           |
| T1   | Multi-source         | Several sources and layers (XYZ, WMS, WMTS, vector tiles, GeoJSON, OGC API – Features), layer control, legend, basemaps |
| T2   | Interaction          | Click and select, feature information panel, search and geocoding, geolocation, measuring, an accessible feature list   |
| T3   | Spatial data capture | Draw, modify and delete geometry; attribute forms; validation; drafts; saving to a back end                             |

### 1.3 Non-goals for v1

- A desktop GIS replacement (geoprocessing, styling editors, print layouts).
- 3D terrain, globe projection and extruded buildings.
- Offline tile caching and offline capture. These are listed for Phase 4.
- Routing and network analysis.

---

## 2) Design principles

1. **Configuration first.** Every map can be described by a `MapConfig` object that is plain, JSON-serialisable data. The config can be stored, versioned, validated and sent from a server. Svelte children are a convenient way to write the same config, not a separate system.
2. **Engine-neutral public API.** Application code never imports `leaflet`, `maplibre-gl` or `ol`. Engine types never appear in public props, events or bindings. Engine-specific needs go through typed escape hatches (§5.4) that are visibly marked as non-portable.
3. **Progressive capability, never silent failure.** Engines do not support the same features. Each adapter declares its capabilities (§6.3). When a config asks for something an engine cannot do, the component either uses a documented fallback or reports a typed `unsupported` error. It never quietly drops a layer.
4. **Browser-only engines behind SSR-safe boundaries.** All three engines need `window` and the DOM. They load only in the browser, through dynamic imports, so SvelteKit server rendering and prerendering keep working (§11).
5. **Pay only for the engine you use.** Each engine and its plugins are optional peer dependencies. An application using MapLibre does not download Leaflet or OpenLayers.
6. **Tokens for styling.** Controls, panels and default feature styles use `--cii-*` tokens and follow `data-cii-theme`, like the rest of `@cii/svelte`.
7. **Accessibility is a release gate.** WCAG 2.2 AA (product spec §6.4) applies to maps too. Every task the map supports, including data capture, must be possible without a pointer and without seeing the map (§10).

---

## 3) Package structure

Create a new workspace package, `packages/maps`, published as `@cii/maps`. It is built with `svelte-package` like `@cii/svelte` and uses its components (`Button`, `TextField`, `Alert`) for controls and forms.

```text
packages/maps/
  package.json
  tsconfig.json
  src/
    index.ts                  Public components, types and helpers
    core/                     No engine imports, no DOM. Unit-tested in Node.
      types.ts                Coordinates, ViewState, Bounds, MapFeature, events
      config.ts               MapConfig types and validateMapConfig()
      view.ts                 Zoom normalisation, bounds maths, view clamping
      style.ts                Engine-neutral style types and rule evaluation
      geometry.ts             Validation, precision rounding, area and length
      capture.svelte.ts       Capture session state: features, history, dirty flag
      adapter.ts              MapEngineAdapter interface and capability types
      registry.ts             Engine name → lazy adapter loader
    components/               Svelte components. Use only the adapter interface.
      CiiMap.svelte
      MapLayer.svelte
      ...
      context.ts              setMapContext() / getMapContext()
    adapters/
      leaflet/index.ts        Exported as @cii/maps/leaflet
      maplibre/index.ts       Exported as @cii/maps/maplibre
      openlayers/index.ts     Exported as @cii/maps/openlayers
  tests/
    unit/*.test.ts
```

### 3.1 Dependencies and exports

- `svelte` and `@cii/svelte` are peer dependencies. `@cii/tokens` and `@types/geojson` (for the `GeoJSON` namespace used in public types) are dependencies.
- `leaflet`, `maplibre-gl`, `ol`, `terra-draw` and the Terra Draw engine adapters are **optional peer dependencies** (`peerDependenciesMeta: { "x": { "optional": true } }`). Engine plugins (for example PMTiles support or `proj4`) are optional peers of the adapter that needs them.
- Subpath exports, following the conditions already used in `packages/svelte/package.json`:

```ts
// packages/maps/package.json "exports" (shown as a typed object for readability)
const exports = {
  '.': {
    types: './dist/index.d.ts',
    development: './src/index.ts',
    svelte: './dist/index.js',
    default: './dist/index.js'
  },
  './leaflet': {
    types: './dist/adapters/leaflet/index.d.ts',
    development: './src/adapters/leaflet/index.ts',
    default: './dist/adapters/leaflet/index.js'
  }
  // './maplibre' and './openlayers' follow the same pattern
} as const;
```

The `.js` paths are generated build output, which `AGENTS.md` permits.

### 3.2 Engine loading

`core/registry.ts` maps engine names to loader functions:

```ts
import type { EngineName, MapEngineAdapterFactory } from './adapter';

export const engineLoaders: Record<
  EngineName,
  () => Promise<MapEngineAdapterFactory>
> = {
  leaflet: () => import('@cii/maps/leaflet').then((m) => m.createAdapter),
  maplibre: () => import('@cii/maps/maplibre').then((m) => m.createAdapter),
  openlayers: () => import('@cii/maps/openlayers').then((m) => m.createAdapter)
};
```

Because each loader is a separate dynamic import, the bundler puts each engine in its own chunk. Applications that want only one engine in the build can call `registerEngine('maplibre', createAdapter)` and pass `engines="registered"` to `<CiiMap>`, which removes the other loaders from the graph.

### 3.3 Root scripts

Add `@cii/maps` to `build:packages` after `@cii/svelte`. The existing `check` and `test:unit` scripts pick it up through `--workspaces --if-present` once the package defines `check` and `test:unit`.

---

## 4) Canonical domain model

These types live in `core/types.ts`. They are the only geometry and view types used in public APIs.

### 4.1 Coordinates and projection

- Public coordinates are always **WGS 84 (EPSG:4326) in GeoJSON order: `[longitude, latitude]`**. Leaflet's `[lat, lng]` order and OpenLayers' projected coordinates stay inside their adapters.
- The display projection defaults to Web Mercator (EPSG:3857). Other display projections are a capability (§6.3), not a default.
- Feature geometry follows [RFC 7946](https://www.rfc-editor.org/rfc/rfc7946) GeoJSON.

```ts
export type LngLat = readonly [lng: number, lat: number];
export type Bounds = readonly [
  west: number,
  south: number,
  east: number,
  north: number
];

export interface ViewState {
  center: LngLat;
  /** Canonical zoom: 256px-tile convention, as used by Leaflet and OpenLayers. */
  zoom: number;
  /** Degrees clockwise from north. Engines without rotation report 0. */
  bearing?: number;
  /** Degrees from vertical. MapLibre only; others report 0. */
  pitch?: number;
}

export type FeatureId = string;

export interface MapFeature<
  P extends Record<string, unknown> = Record<string, unknown>
> extends GeoJSON.Feature<GeoJSON.Geometry, P> {
  /** Required and stable for the life of the feature. Generated with crypto.randomUUID() if missing. */
  id: FeatureId;
}

export interface MapFeatureCollection<
  P extends Record<string, unknown> = Record<string, unknown>
> {
  type: 'FeatureCollection';
  features: MapFeature<P>[];
}
```

### 4.2 Zoom normalisation

Leaflet and OpenLayers use 256px tile zoom levels. MapLibre uses 512px tiles, so the same ground scale is **one zoom level lower** in MapLibre. The public API uses the 256px convention. The MapLibre adapter converts at its boundary:

```ts
export const toMapLibreZoom = (zoom: number): number => zoom - 1;
export const fromMapLibreZoom = (zoom: number): number => zoom + 1;
```

Both functions, and the round trip through every adapter, must be unit-tested. `minZoom`, `maxZoom` and layer zoom ranges use the same convention.

### 4.3 Events

Components expose callback props (Svelte 5 style), not DOM events. Every payload uses canonical types.

| Callback          | Payload                                                        |
| ----------------- | -------------------------------------------------------------- |
| `onviewchange`    | `{ view: ViewState, bounds: Bounds, source: 'user' \| 'api' }` |
| `onmapclick`      | `{ lngLat: LngLat, features: QueryResult[] }`                  |
| `onselect`        | `{ selected: FeatureRef[] }`                                   |
| `onfeaturecreate` | `{ feature: MapFeature }`                                      |
| `onfeatureupdate` | `{ feature: MapFeature, previous: MapFeature }`                |
| `onfeaturedelete` | `{ id: FeatureId }`                                            |
| `onerror`         | `{ error: MapError }`                                          |

`onviewchange` fires at most once per animation frame while the view is moving and once more when movement ends (`settled: true`).

---

## 5) Configuration schema

### 5.1 `MapConfig`

```ts
export type EngineName = 'leaflet' | 'maplibre' | 'openlayers';

export interface MapConfig {
  version: 1;
  engine: EngineName;
  view: ViewState & { minZoom?: number; maxZoom?: number; maxBounds?: Bounds };
  basemaps?: BasemapConfig[];
  sources: SourceConfig[];
  layers: LayerConfig[];
  controls?: ControlsConfig;
  interaction?: InteractionConfig;
  capture?: CaptureConfig;
}

export interface BasemapConfig {
  id: string;
  label: string;
  sourceId: string;
  /** Pairs basemaps with the CII theme. */
  theme?: 'light' | 'dark' | 'any';
  default?: boolean;
}

export interface LayerConfig {
  id: string;
  label: string;
  sourceId: string;
  kind: 'raster' | 'fill' | 'line' | 'point' | 'symbol' | 'heatmap' | 'cluster';
  /** For vector tile sources: the layer inside the tileset. */
  sourceLayer?: string;
  style?: LayerStyle;
  engineStyle?: EngineStyleOverrides;
  visible?: boolean;
  opacity?: number;
  minZoom?: number;
  maxZoom?: number;
  /** Higher draws on top. Ties keep config order. */
  order?: number;
  legend?: LegendEntry[] | false;
  /** Shown in the layer control and used by FeatureInfo. */
  fields?: FieldSchema[];
  queryable?: boolean;
}
```

### 5.2 Source kinds

| `type`           | Required properties                                    | Notes                                                                   |
| ---------------- | ------------------------------------------------------ | ----------------------------------------------------------------------- |
| `xyz`            | `url` with `{z}/{x}/{y}`, `attribution`                | Raster tiles. `tileSize` defaults to 256                                |
| `wms`            | `url`, `layers`, `attribution`                         | `format`, `transparent`, `version`, `params`                            |
| `wmts`           | `url` (capabilities or template), `layer`, `matrixSet` | `style`, `format`                                                       |
| `vector-tiles`   | `url` (template or TileJSON), `attribution`            | MVT. Native in MapLibre and OL; plugin in Leaflet (§6.3)                |
| `pmtiles`        | `url`, `attribution`                                   | Single-file tile archive. Raster or vector                              |
| `geojson`        | `data` (inline collection) or `url`                    | Optional `cluster`, `promoteId`                                         |
| `ogc-features`   | `url` (collection items endpoint), `attribution`       | OGC API – Features. Viewport-driven loading (§12)                       |
| `wfs`            | `url`, `typeName`, `attribution`                       | Read only in v1. Prefer `ogc-features` where the server offers it       |
| `maplibre-style` | `url` to a MapLibre style JSON                         | Capability `nativeStyleJson`. MapLibre native; OL via `ol-mapbox-style` |

Every remote source has an `attribution` string. Validation fails without it (§13).

Authentication uses `headers` or a `transformRequest` function supplied at runtime, not stored in config (§13.1).

### 5.3 Engine-neutral styles

Styles use a small common subset that all three engines can draw. Adapters translate it to Leaflet path options, MapLibre `paint`/`layout` properties and OpenLayers `Style` objects.

```ts
export type Colour = string; // CSS colour or a token reference such as 'token:--cii-brand-primary'

export interface LayerStyle {
  fill?: Colour;
  fillOpacity?: number;
  stroke?: Colour;
  strokeWidth?: number;
  strokeDash?: number[];
  pointRadius?: number;
  icon?: { url: string; size: [number, number]; anchor?: [number, number] };
  label?: { field: string; size?: number; colour?: Colour; halo?: Colour };
  /** Data-driven variations. First matching rule wins. */
  rules?: StyleRule[];
}

export type StyleRule =
  | {
      when: { field: string; equals: string | number | boolean };
      style: Partial<LayerStyle>;
      label: string;
    }
  | {
      when: { field: string; min?: number; max?: number };
      style: Partial<LayerStyle>;
      label: string;
    };
```

- `token:` colours resolve from computed CSS custom properties when the map mounts and again when `data-cii-theme` changes. Canvas and WebGL renderers cannot read CSS variables directly.
- Each rule has a `label`, so the legend can be generated from the style. Legends never rely on colour alone (§10).
- Rule evaluation lives in `core/style.ts`. For Leaflet and OpenLayers the adapter calls it for each feature. For MapLibre it compiles to `match`/`step` expressions. Both paths must produce the same result in tests.

### 5.4 Escape hatches

`engineStyle` and `engineOptions` accept typed, engine-keyed overrides:

```ts
export interface EngineStyleOverrides {
  leaflet?: import('leaflet').PathOptions;
  maplibre?: {
    paint?: Record<string, unknown>;
    layout?: Record<string, unknown>;
  };
  openlayers?: (feature: MapFeature, resolution: number) => unknown;
}
```

They are applied only by the matching adapter. Documentation marks any example using them as non-portable. Type imports are type-only, so they do not pull the engine into other bundles.

### 5.5 Validation

`validateMapConfig(input: unknown)` follows the explicit-result pattern used in `apps/community-portal/src/lib/persistence.ts` and `records.ts`. It is hand-written and typed; no schema library is added.

```ts
export type ConfigErrorCode =
  | 'invalid'
  | 'missing'
  | 'duplicate-id'
  | 'unknown-source'
  | 'unsupported'
  | 'attribution-required';

export interface ConfigError {
  code: ConfigErrorCode;
  /** JSON path, e.g. 'layers[2].sourceId'. */
  path: string;
  message: string;
}

export type ConfigResult =
  | { ok: true; config: MapConfig; warnings: ConfigError[] }
  | { ok: false; errors: ConfigError[] };

export function validateMapConfig(
  input: unknown,
  engine?: EngineCapabilities
): ConfigResult;
```

- Without `engine`, it checks structure only. With an engine's capabilities it also reports `unsupported` items. Items that have a fallback are warnings; items that do not are errors.
- `<CiiMap>` validates before mounting. Errors show in an `Alert` (variant `error`) in place of the map, with the message, the path and what to change. The map does not mount with a partial config.
- Config has a `version` field so stored configs can be upgraded, as stored workspaces are in the portal.

---

## 6) Engine adapter contract

### 6.1 Interface

```ts
export interface MapEngineAdapterFactory {
  (options: AdapterMountOptions): Promise<MapEngineAdapter>;
  capabilities: EngineCapabilities;
}

export interface AdapterMountOptions {
  container: HTMLElement;
  config: MapConfig;
  reducedMotion: boolean;
  resolveColour: (colour: Colour) => string;
  transformRequest?: (
    url: string,
    kind: 'tile' | 'data' | 'style'
  ) => RequestInit | undefined;
}

export interface MapEngineAdapter {
  readonly engine: EngineName;
  readonly capabilities: EngineCapabilities;

  getView(): ViewState;
  setView(view: Partial<ViewState>, options?: { animate?: boolean }): void;
  fitBounds(
    bounds: Bounds,
    options?: { padding?: number; animate?: boolean }
  ): void;
  getBounds(): Bounds;

  addSource(source: SourceConfig): void;
  updateSource(source: SourceConfig): void;
  removeSource(id: string): void;
  setGeoJSON(sourceId: string, data: MapFeatureCollection): void;

  addLayer(layer: LayerConfig): void;
  updateLayer(id: string, patch: Partial<LayerConfig>): void;
  removeLayer(id: string): void;
  setLayerOrder(ids: string[]): void;

  queryAt(
    point: LngLat,
    options?: { layerIds?: string[]; tolerancePx?: number }
  ): Promise<QueryResult[]>;
  queryInBounds(
    bounds: Bounds,
    options?: { layerIds?: string[] }
  ): Promise<QueryResult[]>;
  setSelected(refs: FeatureRef[]): void;

  project(point: LngLat): [x: number, y: number];
  unproject(pixel: [x: number, y: number]): LngLat;

  on<E extends keyof AdapterEvents>(
    event: E,
    handler: (payload: AdapterEvents[E]) => void
  ): () => void;

  capture: CaptureAdapter;

  resize(): void;
  destroy(): void;
}
```

`queryAt` is asynchronous because some sources (WMS `GetFeatureInfo`, OGC Features by point) need a network request.

### 6.2 Reconciliation

Components never re-create the map when props change. `CiiMap` keeps the last applied config and, on each change, computes a diff in `core`:

1. Sources added, changed or removed.
2. Layers added, changed (with only the changed properties) or removed.
3. Layer order.
4. View changes that came from props, not from the user (§7.2).

The adapter applies these as small operations. The diff function is pure and unit-tested without an engine. Changing `engine` is the one exception: it destroys the adapter and mounts the new one with the current view and features.

### 6.3 Capabilities

```ts
export interface EngineCapabilities {
  rendering: 'dom-canvas' | 'canvas' | 'webgl';
  rotation: boolean;
  pitch: boolean;
  projections: 'web-mercator' | 'any';
  sources: Record<SourceConfig['type'], 'native' | 'plugin' | 'core' | false>;
  nativeStyleJson: boolean;
  heatmap: boolean;
  clustering: 'native' | 'plugin' | 'core';
  keyboardNavigation: 'native' | 'core';
}
```

`'core'` means `@cii/maps` implements the feature itself above the engine (for example, building a WMS `GetFeatureInfo` URL from the view, or clustering points with a shared algorithm).

Expected starting matrix. Each entry must be confirmed by the adapter contract tests (§14.2) before release.

| Capability          | Leaflet                                         | MapLibre GL JS                                       | OpenLayers                      |
| ------------------- | ----------------------------------------------- | ---------------------------------------------------- | ------------------------------- |
| Rendering           | DOM/SVG/Canvas                                  | WebGL                                                | Canvas (WebGL layers available) |
| Rotation / pitch    | No / No                                         | Yes / Yes                                            | Yes / No                        |
| Display projections | Web Mercator (others via `proj4leaflet` plugin) | Web Mercator only                                    | Any, with `proj4` registration  |
| XYZ, WMS            | Native                                          | XYZ native; WMS as raster tiles with `bbox` template | Native                          |
| WMTS                | Plugin or core template                         | Core template                                        | Native                          |
| Vector tiles (MVT)  | Plugin (limited styling)                        | Native                                               | Native                          |
| PMTiles             | Plugin                                          | Plugin (`pmtiles` protocol)                          | Plugin                          |
| WMS GetFeatureInfo  | Core                                            | Core                                                 | Native                          |
| MapLibre style JSON | No                                              | Native                                               | Plugin (`ol-mapbox-style`)      |
| Heatmap             | Plugin                                          | Native                                               | Native                          |
| Clustering          | Plugin or core                                  | Native (GeoJSON source)                              | Native                          |
| Keyboard pan/zoom   | Native                                          | Native                                               | Native (map must be focusable)  |

Adapters wrap native features first. Plugins are added only when they are maintained and their licence is compatible (§13.3). Prefer `'core'` over an unmaintained plugin.

### 6.4 Adapter rules

- Import the engine's CSS inside the adapter module, so it loads with the engine chunk.
- Convert all coordinates, zooms and events at the boundary. No engine object escapes the adapter.
- Every listener, interaction and object an adapter creates is released in `destroy()`. MapLibre must call `map.remove()` so the WebGL context is freed.
- Adapters do not render controls. Controls are Svelte components (§7) that call the adapter, so they look and behave the same on every engine. Engine default controls are disabled.

---

## 7) Component catalogue

All components follow the conventions in `packages/svelte/src/TextField.svelte`: a `Props` type, `$props()`, `$bindable()` for two-way values, remaining attributes forwarded to the root element, and scoped styles using `--cii-*` tokens.

### 7.1 Usage modes

The same map can be written in two ways, and both produce the same internal state.

**Declarative children:**

```svelte
<script lang="ts">
  import {
    CiiMap,
    MapSource,
    MapLayer,
    ZoomControls,
    ScaleBar,
    Legend
  } from '@cii/maps';
  import type { ViewState } from '@cii/maps';

  let view = $state<ViewState>({ center: [-1.55, 53.8], zoom: 11 });
</script>

<CiiMap engine="maplibre" label="Community venues in Leeds" bind:view>
  <MapSource
    id="osm"
    type="xyz"
    url="https://tiles.example.org/{z}/{x}/{y}.png"
    attribution="© OpenStreetMap contributors"
  />
  <MapSource id="venues" type="geojson" url="/data/venues.geojson" />
  <MapLayer id="base" label="Street map" sourceId="osm" kind="raster" />
  <MapLayer
    id="venues"
    label="Venues"
    sourceId="venues"
    kind="point"
    style={{ fill: 'token:--cii-brand-primary', pointRadius: 6 }}
    queryable
  />
  <ZoomControls />
  <ScaleBar />
  <Legend />
</CiiMap>
```

**Single config:**

```svelte
<script lang="ts">
  import { CiiMap } from '@cii/maps';
  import type { MapConfig } from '@cii/maps';

  let { config }: { config: MapConfig } = $props();
</script>

<CiiMap {config} label="Service coverage" />
```

When both are given, children are merged over `config` by `id`, and a duplicate-id warning is reported.

### 7.2 `<CiiMap>`

The root component. It validates config, loads the adapter, owns its lifecycle and provides context to children.

| Property      | Type                                                           | Default           |
| ------------- | -------------------------------------------------------------- | ----------------- |
| `label`       | string (required)                                              | —                 |
| `engine`      | `EngineName`                                                   | `config.engine`   |
| `config`      | `MapConfig`                                                    | —                 |
| `view`        | `ViewState` (bindable)                                         | `config.view`     |
| `selected`    | `FeatureRef[]` (bindable)                                      | `[]`              |
| `height`      | CSS length                                                     | `'420px'`         |
| `aspectRatio` | string, e.g. `'16 / 9'`                                        | —                 |
| `description` | string                                                         | —                 |
| `loading`     | Svelte snippet                                                 | built-in skeleton |
| `error`       | Svelte snippet `(errors: MapError[])`                          | built-in `Alert`  |
| `children`    | Svelte snippet                                                 | —                 |
| Callbacks     | `onviewchange`, `onmapclick`, `onselect`, `onerror`, `onready` | —                 |

Behaviour:

- Renders a sized container immediately, so there is no layout shift while the engine loads.
- `view` is controlled. A prop change moves the map (`source: 'api'`). User movement updates the bound value (`source: 'user'`). The component ignores the echo of its own update to avoid loops.
- Exposes context through `setMapContext()` and `getMapContext()` in `components/context.ts`. Context holds the adapter (once ready), a register/unregister API for sources, layers and controls, and the current capabilities. Calling `getMapContext()` outside `<CiiMap>` throws a clear error.
- Child registration works before the adapter is ready. Registrations are queued and applied on mount.
- Watches the container with `ResizeObserver` and calls `adapter.resize()`.

### 7.3 Display and layer components (T0–T1)

| Component           | Purpose                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| `<MapSource>`       | Declares a source. Props match `SourceConfig`. Renders nothing                                                 |
| `<MapLayer>`        | Declares a layer. Props match `LayerConfig`. `visible` and `opacity` are bindable                              |
| `<GeoJSONLayer>`    | Shortcut: a GeoJSON source and a layer in one, with `data` bindable                                            |
| `<BasemapSwitcher>` | Radio group of basemaps. Follows `data-cii-theme` when the basemap has a theme pair, unless the user chose one |
| `<LayerControl>`    | Grouped checkboxes with opacity sliders. Shows out-of-range layers as disabled with "Zoom in to see" text      |
| `<Legend>`          | Built from layer styles and rules. Each entry has a swatch, a shape and a text label                           |
| `<ZoomControls>`    | Zoom in, zoom out and "reset view" buttons                                                                     |
| `<ScaleBar>`        | Metric by default; `units="imperial" \| "both"`                                                                |
| `<Attribution>`     | Always rendered by `<CiiMap>`. Can be restyled or collapsed into a button, but not removed                     |

### 7.4 Interaction components (T2)

| Component             | Purpose                                                                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<FeatureInfo>`       | Shows details of selected features. Popup near the feature on wide screens; a drawer panel below 768px. Content from a snippet or from the layer's `fields` |
| `<FeatureList>`       | A table of features in the current view (or a layer), with select, zoom-to and pagination. It is the non-visual alternative to the map                      |
| `<Geocoder>`          | Search box with a results list. Uses a `GeocoderProvider` supplied by the application                                                                       |
| `<Geolocate>`         | "Show my location" button. Explains denied permission in text                                                                                               |
| `<MeasureTool>`       | Measure distance or area. Uses capture modes internally but does not create features                                                                        |
| `<CoordinateReadout>` | Shows the pointer or centre coordinate in a chosen format (decimal degrees, DMS, or a projected grid via a formatter)                                       |

```ts
export interface GeocoderProvider {
  search(
    query: string,
    options: { signal: AbortSignal; bounds?: Bounds; limit: number }
  ): Promise<GeocoderResult[]>;
  reverse?(
    point: LngLat,
    options: { signal: AbortSignal }
  ): Promise<GeocoderResult | undefined>;
}

export interface GeocoderResult {
  id: string;
  label: string;
  point: LngLat;
  bounds?: Bounds;
}
```

`<FeatureInfo>` never inserts HTML from feature properties or `GetFeatureInfo` responses. Properties are shown as text through Svelte snippets or the `fields` schema (§13.2).

### 7.5 Capture components (T3)

| Component           | Purpose                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| `<CaptureLayer>`    | Holds the features being captured. `features` is bindable. Renders nothing visible on its own      |
| `<CaptureToolbar>`  | Mode buttons (point, line, polygon, rectangle, circle, select, delete), undo, redo, finish, cancel |
| `<FeatureEditor>`   | Attribute form for the selected feature, built from a `FieldSchema` using `@cii/svelte` fields     |
| `<VertexList>`      | Editable list of the selected feature's vertices: add, move (by typed coordinates), remove         |
| `<CoordinateInput>` | Accessible coordinate entry with format parsing and validation                                     |
| `<CaptureStatus>`   | Live summary: feature count, validation problems, unsaved changes                                  |

---

## 8) Spatial data capture

### 8.1 Drawing engine

Use **[Terra Draw](https://github.com/JamesLMilner/terra-draw)** for drawing and editing on all three engines. It is MIT-licensed and engine-agnostic, with adapters for Leaflet, MapLibre and OpenLayers. Using one drawing library keeps modes, gestures, validation and output the same on every engine, which is the main point of this component set.

- Each `@cii/maps` adapter wraps the matching Terra Draw adapter and exposes it as `adapter.capture`.
- Terra Draw types do not appear in the public API. Its features are converted to `MapFeature` with stable ids.
- Fallback: if a needed capability is missing in a Terra Draw adapter, the OpenLayers adapter may use native `ol/interaction` `Draw`, `Modify` and `Snap` instead. This must be declared in `capabilities` and must pass the same contract tests.
- Pin the Terra Draw version and its adapter versions together. Check upstream package names and adapter support when Phase 3 starts (§17).

### 8.2 Capture configuration

```ts
export type CaptureMode =
  'point' | 'line' | 'polygon' | 'rectangle' | 'circle' | 'select' | 'delete';

export interface CaptureConfig {
  modes: CaptureMode[];
  geometry: {
    /** Decimal places kept on output. 6 ≈ 0.1 m. */
    precision?: number;
    minVertices?: number;
    maxVertices?: number;
    minAreaSqM?: number;
    maxAreaSqM?: number;
    allowSelfIntersection?: boolean;
    /** Features must lie within this polygon, e.g. a service area. */
    within?: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  };
  snapping?: {
    toVertices?: boolean;
    toEdges?: boolean;
    layerIds?: string[];
    tolerancePx?: number;
  };
  maxFeatures?: number;
  fields?: FieldSchema[];
  draft?: { storageKey: string };
}

export type FieldSchema =
  | {
      name: string;
      label: string;
      type: 'text' | 'textarea';
      required?: boolean;
      maxLength?: number;
      hint?: string;
    }
  | {
      name: string;
      label: string;
      type: 'number';
      required?: boolean;
      min?: number;
      max?: number;
      step?: number;
    }
  | {
      name: string;
      label: string;
      type: 'select' | 'radio';
      required?: boolean;
      options: { value: string; label: string }[];
    }
  | {
      name: string;
      label: string;
      type: 'date' | 'checkbox';
      required?: boolean;
    };
```

Circles are stored as polygons, because GeoJSON has no circle type. The centre and radius go in `properties._circle` so the shape can be edited again.

### 8.3 Capture session state

Session state is a reactive class in `core/capture.svelte.ts`, so it can be tested without an engine:

- `features`: the current `MapFeatureCollection`.
- `history`: a bounded undo/redo stack (default 50 steps) of operations, not snapshots. A drag records one step when it ends.
- `dirty`: true when `features` differs from the last saved or loaded state.
- `issues`: validation results for each feature (§8.4).
- `mode` and `selectedId`.

`<CaptureLayer bind:features>` connects this state to the adapter. Loading features into the layer (for editing existing data) resets history and `dirty`.

### 8.4 Validation

Validation runs in `core/geometry.ts` after every change and before saving.

| Check               | When it blocks                                              |
| ------------------- | ----------------------------------------------------------- |
| Self-intersection   | Always for polygons, unless `allowSelfIntersection` is true |
| Vertex count        | Outside `minVertices` / `maxVertices`                       |
| Area                | Outside `minAreaSqM` / `maxAreaSqM` (geodesic area)         |
| Within boundary     | Any vertex outside `within`                                 |
| Required attributes | A required field is empty                                   |
| Application rules   | `validate(feature)` callback returns issues                 |

Issues are shown in three places: on the map (highlighted feature or vertex), in `<CaptureStatus>`, and next to the field in `<FeatureEditor>` using the existing `TextField` error pattern. Each issue has text, not only colour.

### 8.5 Drafts and saving

- **Drafts.** With `draft.storageKey`, the session saves to browser storage after changes (debounced). It uses the versioned, validated approach in `apps/community-portal/src/lib/persistence.ts`: a stored draft that fails validation is kept unchanged and the user is offered an explicit recovery, never a silent overwrite.
- **Saving.** Applications supply a `CaptureSink`:

```ts
export interface CaptureSink {
  load?(
    signal: AbortSignal
  ): Promise<{ features: MapFeatureCollection; revision?: string }>;
  save(
    change: CaptureChangeSet,
    options: { signal: AbortSignal; revision?: string }
  ): Promise<SaveResult>;
}

export interface CaptureChangeSet {
  created: MapFeature[];
  updated: MapFeature[];
  deleted: FeatureId[];
}

export type SaveResult =
  | { ok: true; revision?: string; idMap?: Record<FeatureId, FeatureId> }
  | {
      ok: false;
      reason: 'conflict' | 'invalid' | 'network' | 'forbidden';
      message: string;
      issues?: Record<FeatureId, string[]>;
    };
```

- Sinks are provided for a generic JSON endpoint and for OGC API – Features transactions (Phase 4). WFS-T is out of scope unless a project needs it.
- `revision` supports optimistic concurrency (product spec §13). On a `conflict`, the user's changes are kept and the UI offers to reload or compare.
- `idMap` replaces client ids with server ids after a create.
- Saving follows the product spec feedback rules (§6.3): a success toast, and on failure an actionable message that keeps the user's work.

### 8.6 Accessible capture

Capture must be possible with a keyboard and a screen reader. These features are required for T3, not optional extras:

- **Crosshair mode.** A visible crosshair at the map centre. The user pans with the arrow keys and presses Enter to add a vertex at the centre, Backspace to remove the last vertex, and Escape to cancel. Finishing a line or polygon is a button and a key (`F`).
- **Typed coordinates.** `<CoordinateInput>` accepts decimal degrees and DMS, plus any projected format the application registers (for example British National Grid). Invalid input shows an inline error.
- **Vertex list.** `<VertexList>` lets users review and edit every vertex as text.
- **Announcements.** A polite live region announces mode changes, vertex counts, completed features, validation issues and save results.
- **Search to start.** `<Geocoder>` can move the crosshair to an address before capture.

---

## 9) Theming and styling

- Controls and panels use tokens: `--cii-bg-card`, `--cii-border-default`, `--cii-text-primary`, `--cii-text-secondary`, `--cii-radius-button`, `--cii-space-*`, and `--cii-focus-ring` for focus outlines.
- Default feature styles: `--cii-map-feature` for data, `--cii-brand-secondary` for selection and `--cii-status-error` for invalid features. Capture styles (active vertex, midpoint handles, drawing line) come from tokens too.
- `--cii-map-feature` uses light-theme navy (`#122B4D`) and dark-theme light purple (`#B39BFF`). This dedicated semantic token keeps default feature outlines distinguishable against `--cii-bg-subtle` without changing brand colours. Custom colours, transparency and basemaps need their own contrast checks.
- Selection is shown by more than colour: a thicker outline and, for points, a ring.
- Basemaps can come in light and dark pairs (`BasemapConfig.theme`). The map follows `data-cii-theme` until the user picks a basemap.
- Theme changes re-resolve `token:` colours and update layer styles through reconciliation, without re-mounting.
- Map controls sit in the map corners and must not cover attribution. On narrow screens they collapse into a single "Map tools" menu.

---

## 10) Accessibility

Target: WCAG 2.2 AA (product spec §6.4). Requirements specific to maps:

1. **Landmark and name.** The map container is `role="region"` with `aria-label` from the required `label` prop. Its `description` is linked with `aria-describedby`.
2. **Keyboard.** The map is focusable. Arrow keys pan, `+` and `-` zoom, and `Shift` + arrows rotate where supported. Shortcuts are listed in a "Keyboard shortcuts" disclosure. Focus never gets trapped in the map.
3. **Controls.** Every control is a native `button`, `input` or `select` with a visible label or accessible name. Focus order: map, then controls in visual order. Targets are at least 24×24 CSS px.
4. **Non-visual equivalents.** Every layer that carries information has a non-map equivalent: `<FeatureList>` for features, and text in `<Legend>` for styles. A page must not depend on the map alone.
5. **Colour and contrast.** Legend entries combine colour with shape, pattern or label. Default overlay styles meet 3:1 against the default basemaps. Text over the map has a solid background.
6. **Motion.** With `prefers-reduced-motion: reduce`, view changes jump instead of animating, and inertia is off.
7. **Announcements.** View changes caused by search or "zoom to" are announced ("Showing Leeds city centre"). Ordinary panning is not announced.
8. **Popups.** `<FeatureInfo>` moves focus into the panel when opened by keyboard and returns focus on close, following the drawer and modal behaviour in `@cii/svelte`.

---

## 11) SvelteKit and SSR integration

- Engines load only in the browser. `<CiiMap>` imports the adapter inside `onMount` (or an `$effect`), so server rendering outputs only the sized placeholder. This works with `@sveltejs/adapter-static`, which both apps use.
- `@cii/maps` components can be imported in server-rendered pages. The core module must not touch `window` at import time.
- Destroying `<CiiMap>` calls `adapter.destroy()`. A test mounts and unmounts the map repeatedly and checks that WebGL contexts and listeners are released (§14).
- Content Security Policy notes for deployment:
  - MapLibre creates workers from `blob:` URLs, so `worker-src blob:` (and `child-src blob:` for older browsers) is needed. Alternatively, use MapLibre's CSP build and serve its worker file.
  - Tile, style, glyph and data hosts must be listed in `img-src` and `connect-src`.
- Add map data hosts to the deployment documentation in `README.md` when the first app uses maps.

---

## 12) Performance

- **Bundle budgets.** Measure each engine chunk (gzip) when Phase 1 lands and set budgets from that baseline. Core and components without an engine should stay under 25 kB gzip. CI fails if a budget grows by more than 10% without an explicit update.
- **Lazy loading.** Engines, Terra Draw and plugins load only when used. Capture code loads when a `<CaptureLayer>` is present.
- **Large data.**
  - Inline or URL GeoJSON over about 5 MB or 20,000 features triggers a development warning that recommends vector tiles or PMTiles.
  - Point layers over about 2,000 features should cluster.
  - `ogc-features` and `wfs` sources load by viewport with `bbox` and `limit`, debounced, and cancel stale requests with `AbortController`.
- **Events.** `onviewchange` is limited to one call per animation frame. Feature queries on hover are off by default.
- **Workers.** Heavy core work (for example, validating large polygons) can move to a Web Worker in later phases. The core API is designed so this does not change public types.

---

## 13) Security, keys and licensing

### 13.1 Keys and requests

- API keys and tokens are never committed and never stored in `MapConfig`. Applications pass them at runtime through `transformRequest` or source `headers`, using environment variables or a server-side proxy.
- Treat any key that reaches the browser as public. Restrict it by referrer at the provider.

### 13.2 Untrusted content

- Feature properties, WMS `GetFeatureInfo` responses, geocoder results and remote style JSON are untrusted.
- Never use `{@html}` or `innerHTML` for them. Show text through Svelte expressions. If a project really needs HTML from a trusted server, it must be sanitised and enabled by explicit opt-in.
- Validate remote GeoJSON shape before adding it to a source. Treat invalid data as a source error, not a crash.

### 13.3 Attribution and licences

- Every remote source must have attribution, and `<Attribution>` always shows it. This is often a legal requirement of the data licence.
- Follow each tile provider's usage policy. Do not use `tile.openstreetmap.org` for production traffic; use a commercial or self-hosted tile service.
- Library licences: Leaflet (BSD-2-Clause), MapLibre GL JS (BSD-3-Clause), OpenLayers (BSD-2-Clause), Terra Draw (MIT). Check the licence of every plugin before adding it, and record it in the package README.

---

## 14) Testing strategy

### 14.1 Unit tests (Node)

Run with `node --experimental-strip-types --test tests/unit/*.test.ts`, as the portal does. Cover everything in `core/`:

- `validateMapConfig`: each error code, warnings with capabilities, version upgrades.
- Zoom conversion and view clamping.
- Config diffing and reconciliation output.
- Style rule evaluation, and the MapLibre expression compiler matching the per-feature evaluator.
- Geometry validation, precision rounding, geodesic area and length.
- Capture history: undo, redo, drag coalescing, `dirty` tracking.
- Draft persistence: valid, invalid and legacy stored drafts.

### 14.2 Adapter contract suite (Playwright)

One set of browser tests runs against **all three engines**. Add a test-harness route to the docs app (for example `/test/maps?engine=leaflet&fixture=multi-source`) that renders fixtures from config. Tests run against the production preview, like the existing suites.

Each fixture checks the same results on each engine:

- The view after `setView` and `fitBounds`, within a tolerance.
- Sources and layers appear, change, reorder and disappear.
- `queryAt` returns the expected feature ids.
- Capture: draw each geometry type, modify, delete, undo and redo, and check the output GeoJSON.
- Capabilities: an `unsupported` config shows the expected error.

Tests use local fixture tiles and data served by the preview, not live tile services, so they are reliable and offline.

MapLibre needs WebGL. In headless Chromium, enable software rendering in `playwright.config.ts` (for example `--use-angle=swiftshader` or `--enable-unsafe-swiftshader`, depending on the Chromium version) and check it in CI.

### 14.3 Accessibility tests

Follow `apps/community-portal/tests/accessibility.spec.ts`: reach every control with the keyboard only, never with the mouse. Required scenarios:

- Pan and zoom with the keyboard.
- Switch basemaps and toggle layers.
- Select a feature from `<FeatureList>` and read it in `<FeatureInfo>`.
- Capture a polygon with crosshair mode only, fill its attributes, fix a validation error, and save.
- Check live-region messages.

### 14.4 Visual and leak tests

- Screenshot each fixture per engine and theme. Allow per-engine baselines, because the engines render slightly differently.
- Mount and unmount each engine 20 times and check for leaked listeners and WebGL contexts.

---

## 15) Documentation

- Add a **Maps** section to the docs site under `apps/docs/src/routes/components/map/`, with one page per component. Use the existing page format: introduction, live example, Usage, Properties, Behaviour and accessibility, Variants and states.
- Live examples live in `apps/docs/src/lib/examples/` and include an **engine switcher**, so readers can compare the same config on all three engines.
- Add pages for the configuration reference, the capability matrix (generated from adapter `capabilities`), capture, and accessible capture.
- Add a patterns page for "Record location" (a single point on a record form) and "Area of interest" (a polygon with attributes).
- Add a map to the community portal as a reference use, for example event venues on a map and a location field on the case form.
- All snippets use TypeScript (`AGENTS.md`).

---

## 16) Delivery roadmap and acceptance criteria

Each phase is complete only when its checklist and the shared criteria below are met.

**Shared criteria for every phase**

- `npm run check`, `npm run test:unit` and `npm test` pass.
- The adapter contract suite passes on all three engines for that phase's features. Any accepted gap is recorded in `capabilities` with a fallback or error.
- Keyboard-only accessibility tests for the phase pass.
- Docs pages for new components are published.
- Bundle budgets are met.

| Phase | Scope                                                                                                                                                                           | Done when                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 0     | `core` types, `validateMapConfig`, diffing, adapter interface, registry, test harness route                                                                                     | Core unit tests pass. A stub adapter passes the contract suite skeleton                                                 |
| 1     | T0 on all engines: `<CiiMap>`, XYZ basemap, `<ZoomControls>`, `<ScaleBar>`, `<Attribution>`                                                                                     | The same config renders on all three engines with matching view. SSR placeholder, error `Alert` and leak test pass      |
| 2     | T1 and T2: all v1 source kinds, `<MapLayer>`, `<LayerControl>`, `<BasemapSwitcher>`, `<Legend>`, `<FeatureInfo>`, `<FeatureList>`, `<Geocoder>`, `<Geolocate>`, `<MeasureTool>` | Multi-source fixture passes on all engines. Capability matrix page generated. Feature selection works by keyboard       |
| 3     | T3 capture: Terra Draw integration, all modes, validation, `<FeatureEditor>`, `<VertexList>`, `<CoordinateInput>`, drafts, generic JSON `CaptureSink`                           | Capture fixtures give identical GeoJSON on all engines. Keyboard-only capture test passes. Portal reference use shipped |
| 4     | Editing remote data with OGC API – Features transactions, advanced snapping, non-Mercator projections (OpenLayers), offline drafts and tiles                                    | Scoped per project need                                                                                                 |

---

## 17) Open decisions and risks

| Item                             | Risk or question                                                                    | Proposed handling                                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Terra Draw adapter maturity      | Behaviour may differ between its engine adapters, especially snapping and selection | Contract tests first; native OpenLayers interactions as the documented fallback                                    |
| Library versions                 | Leaflet 2 is ESM-first and changes some APIs; MapLibre and OpenLayers release often | Target the current major of each at Phase 0, pin in the package, review each quarter                               |
| Size of the neutral style subset | Too small and teams use escape hatches; too large and adapters diverge              | Start with §5.3. Add properties only when all three engines can draw them                                          |
| Vector tiles in Leaflet          | Plugin support is weaker than in MapLibre and OpenLayers                            | Mark as `plugin` with limited styling, and recommend MapLibre or OpenLayers for vector-heavy maps                  |
| Geocoding provider               | Cost, terms and data quality vary                                                   | Keep `GeocoderProvider` pluggable; choose per project                                                              |
| Engine-specific features         | Pressure to expose MapLibre 3D or OpenLayers projections in the shared API          | Expose through capabilities and escape hatches; add to the neutral API only when portable                          |
| Projected coordinate input       | Many organisations need local grids (for example British National Grid)             | Pluggable coordinate formatters and parsers using `proj4`, loaded on demand                                        |
| Default engine                   | Teams need guidance                                                                 | Recommend MapLibre for vector basemaps, OpenLayers for OGC services and projections, Leaflet for light raster maps |

---

## Appendix A — Capture example

```svelte
<script lang="ts">
  import {
    CiiMap,
    MapSource,
    MapLayer,
    CaptureLayer,
    CaptureToolbar,
    FeatureEditor,
    CaptureStatus
  } from '@cii/maps';
  import type {
    CaptureConfig,
    MapFeatureCollection,
    CaptureSink
  } from '@cii/maps';
  import { Button } from '@cii/svelte';

  let { sink }: { sink: CaptureSink } = $props();

  let features = $state<MapFeatureCollection>({
    type: 'FeatureCollection',
    features: []
  });
  let layer = $state<ReturnType<typeof CaptureLayer>>();
  let saving = $state(false);

  const capture: CaptureConfig = {
    modes: ['point', 'polygon', 'select', 'delete'],
    geometry: { precision: 6, minAreaSqM: 10, allowSelfIntersection: false },
    snapping: { toVertices: true, tolerancePx: 8 },
    fields: [
      {
        name: 'name',
        label: 'Site name',
        type: 'text',
        required: true,
        maxLength: 80
      },
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        required: true,
        options: [
          { value: 'proposed', label: 'Proposed' },
          { value: 'active', label: 'Active' }
        ]
      }
    ],
    draft: { storageKey: 'cii-sites-capture-draft' }
  };

  async function save(): Promise<void> {
    if (!layer) return;
    saving = true;
    try {
      // Validates, sends the change set to the sink and reports the result in CaptureStatus.
      await layer.save();
    } finally {
      saving = false;
    }
  }
</script>

<CiiMap
  engine="openlayers"
  label="Record community sites"
  view={{ center: [-1.55, 53.8], zoom: 13 }}
>
  <MapSource
    id="base"
    type="xyz"
    url="https://tiles.example.org/{z}/{x}/{y}.png"
    attribution="© OpenStreetMap contributors"
  />
  <MapLayer id="base" label="Street map" sourceId="base" kind="raster" />

  <CaptureLayer bind:this={layer} config={capture} bind:features {sink}>
    <CaptureToolbar />
    <FeatureEditor />
    <CaptureStatus />
  </CaptureLayer>
</CiiMap>

<Button onclick={save} loading={saving}>Save sites</Button>
```

Changing `engine="openlayers"` to `"leaflet"` or `"maplibre"` must give the same behaviour and the same `features` output. The contract suite (§14.2) checks this.
