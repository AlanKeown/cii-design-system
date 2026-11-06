---
title: Map
description: Leaflet feature and XYZ tile maps with explicit CRS confirmation and first-party layer controls.
---

<script lang="ts">
  import MapExample from '#lib/examples/MapExample.svelte';
</script>

`@cii/maps/svelte` provides an SSR-safe `MapContainer`. This first slice
displays inline and fetched GeoJSON features and standard Web Mercator XYZ
raster tiles using Leaflet 1.9.4, first-party zoom and layer controls, and
mandatory attribution.

<MapExample />

## Usage

```svelte
<script lang="ts">
  import '@cii/tokens/tokens.css';
  import { MapContainer } from '@cii/maps/svelte';
  import type { MapConfig } from '@cii/maps';

  const config: MapConfig = {
    engine: 'leaflet',
    view: { center: { crs: 'OGC:CRS84', coordinates: [151.21, -33.87] }, zoom: 14 },
    layers: [{
      id: 'sites',
      source: {
        provider: 'geojson', url: '/data/sites.geojson',
        crs: { code: 'OGC:CRS84', provenance: { kind: 'declared', by: 'application author' } }
      },
      attribution: 'Your data attribution'
    }]
  };
</script>

<MapContainer {config} label="Community sites" description="Community locations, also available in the adjacent list." />
```

Install the `leaflet` peer (`>=1.9.4 <2`) and the package's `proj4` peer.
Leaflet code loads in the browser during mounting; its CSS is included by the
Svelte entry point. Always provide a meaningful `label` and a non-map
alternative for information in the map.

## XYZ basemaps and layer controls

Add an XYZ layer before the feature overlays and enable the layer list:

```ts
import type { MapConfig } from '@cii/maps';

const config: MapConfig = {
  engine: 'leaflet',
  display: { crs: 'EPSG:3857' },
  view: {
    center: { crs: 'OGC:CRS84', coordinates: [151.21, -33.87] },
    zoom: 14
  },
  controls: [{ id: 'zoom' }, { id: 'layer-list', position: 'top-right' }],
  layers: [{
    id: 'basemap',
    attribution: 'Your tile provider’s required credit',
    order: 0,
    source: {
      provider: 'xyz',
      url: '/tiles/{z}/{x}/{y}.png',
      crs: {
        code: 'EPSG:3857',
        provenance: { kind: 'declared', by: 'application author' }
      }
    }
  }]
};
```

Supply a real tile service at the example URL. The live example above uses a
local repeating synthetic grid, not a street map or geographic reference.

XYZ currently means 256-pixel tiles on the standard EPSG:3857 grid, zooms 0–24,
with a top-left origin and Y increasing southward. Only `{z}`, `{x}` and `{y}`
URL placeholders are supported. TMS, subdomain templates, retina/512-pixel
conventions and custom grids are not implemented. A different source CRS or
incompatible display grid is refused; tiles are never reprojected. No tiles are
shown outside that zoom range. Use layer opacity rather than feature styles on
raster layers.

The layer list appears at the top right when enabled. It provides labelled
checkboxes, keyboard-operable opacity sliders and move-up/move-down buttons.
Layers are listed from top to bottom; higher order values render above lower
ones. Omitted orders follow configuration array order. These controls patch
existing layer handles and preserve the map view. Control changes are local to
the mounted map; applying a new `config` restores the settings in that config.
Use application-owned reactive configuration when settings must persist.

Attribution is rendered as plain text for visible layers, including layers with
zero opacity. Tile failures reach `onerror` as `LAYER_LOAD_FAILED` and appear in
the map's error area; hide and show the layer to retry. A tile error does not
remove working sibling layers. Layer readiness means attachment, not that every
tile in the viewport has downloaded. Hiding/removing the layer or unmounting
releases pending tile images and native resources.

XYZ uses browser image requests, including normal browser cookie rules. The
runtime `fetch` override applies to GeoJSON requests; it does not intercept tile
images. Serve authenticated tiles through an application-owned URL when custom
request headers are needed. Keep credentials out of configuration.

## Properties

| Property       | Type                                                 | Default                  |
| -------------- | ---------------------------------------------------- | ------------------------ |
| `config`       | `MapConfig` (required)                               | —                        |
| `label`        | string (required)                                    | —                        |
| `description`  | string                                               | —                        |
| `height`       | CSS length                                           | `24rem`                  |
| `view`         | `ViewState`, bindable                                | —                        |
| `runtime`      | `MapRuntime`, read once when mounted                 | `createLeafletRuntime()` |
| `children`     | Svelte snippet                                       | —                        |
| `onready`      | `(engine: IMapEngine) => void`                       | —                        |
| `onerror`      | `(error: MapError) => void`                          | —                        |
| `onviewchange` | `(view: ViewState, source: 'api' \| 'user') => void` | —                        |

`MapContainer` accepts `class` and forwards HTML attributes, including `data-*`
and ARIA attributes, to its root section. Caller-provided `aria-describedby` IDs
are combined with the component description.

## Behaviour and accessibility

The canvas becomes tabbable after it is ready. Arrow keys pan and +/− zoom. Zoom
controls have accessible names and visible focus styles; Tab leaves the map
normally. Reduced-motion settings disable inertia and animated view requests.
Attribution is always present and remote data attribution is rendered as text.

Changing data, visibility, opacity, order or base style updates the existing
map. Network requests are cancelled when superseded or unmounted, and pending
engine loads cannot call `onready` after teardown. The canvas resizes with its
container. `view` is bindable; view changes are also available through
`onviewchange`. Use `onready` to access the typed engine contract and `onerror`
for typed errors.

Engine/display changes require an explicit component remount in this slice;
runtime CRS switch orchestration remains pending. The initial `runtime` prop can
inject app-owned registries or a fetch implementation through
`createLeafletRuntime`, exported from `@cii/maps/svelte`. Credentials belong in
that runtime fetch implementation, not in serialised map config.

## CRS and accuracy

Every input source requires a declaration. A GeoJSON file's RFC 7946 CRS is a
suggestion; it cannot confirm the source by itself. Inline sources can
explicitly tag projected or geographic coordinates. Display defaults to
EPSG:3857. Leaflet features are transformed from original coordinates into the
display CRS's geographic base, and source coordinates remain available
unchanged.

The first adapter supports EPSG:3857, EPSG:4326 and CRS84 display. A display CRS
without a registered tile matrix uses explicit `view.resolution` rather than
zoom. Other display CRSs fail without fallback. GDA94/GDA2020 inputs can be
shown on Web Mercator, with a visible datum warning; this does not certify
survey alignment.

## Content

Make `label` name what the map shows, such as "Community sites"; the canvas is
announced as that label followed by "map canvas". Use `description` for the
purpose of the map and where its text alternative is. It is shown above the map
and linked to it with `aria-describedby`. Put every fact a user needs from the
map in that alternative, such as a list or
[data table](/components/data-table/), because features on the canvas are not
exposed to assistive technology.

Write attribution as the provider's required credit in plain text. When the map
cannot load or update, a danger [Alert](/components/alert/) explains what
happened and what to check next. Invalid configurations include field paths,
validation messages and suggested corrections. `onerror` retains the original
typed error codes and details for application diagnostics.

## Themes and responsive layout

The map surface, border, controls and alerts use semantic tokens and follow
`data-cii-theme`. `token:` colours in layer styles are resolved again when the
theme changes, without remounting the map.

Without a colour override, feature outlines use `--cii-map-feature`: navy
(`#122B4D`) in light mode and light purple (`#B39BFF`) in dark mode. The token
is designed for the `--cii-map-surface` background, which currently matches
`--cii-bg-subtle`; custom colours, reduced opacity and basemaps need separate
contrast checks. When a layer sets its own colours, prefer `--cii-map-*` tokens,
such as `token:--cii-map-feature`, over UI or brand tokens. Map tokens are
checked against the map background in both themes. Import
`@cii/tokens/tokens.css`; missing colour tokens produce an actionable layer error
instead of a substitute palette. Do not rely on colour alone to distinguish
layers.

The map fills the width of its container and resizes with it. `height` sets the
viewport height, with a minimum of 12rem. On small screens, choose a height that
leaves the text alternative and surrounding content easy to reach. Attribution
wraps within the container.

## Scope and limits

This slice supports base path styling, circle points, theme tokens and standard
Web Mercator XYZ raster basemaps. Labels, icons, data-driven rules, custom
projected displays and editing are not implemented yet; unsupported options fail explicitly. GeoJSON reads are
bounded to 5 MiB, 10,000 features and 100,000 positions. Properties are treated
as data and never inserted as HTML.
