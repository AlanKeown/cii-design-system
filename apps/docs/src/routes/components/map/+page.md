---
title: Map
description: Leaflet, OpenLayers and MapLibre maps with confirmed source CRS, projected displays and first-party controls.
---

<script lang="ts">
  import MapEnginesExample from '#lib/examples/MapEnginesExample.svelte';
  import LayerExample from '#lib/examples/LayerExample.svelte';
  import MapExample from '#lib/examples/MapExample.svelte';
  import RuntimeCrsExample from '#lib/examples/RuntimeCrsExample.svelte';
  import CrsConfirmExample from '#lib/examples/CrsConfirmExample.svelte';
</script>

`@cii/maps/svelte` provides an SSR-safe `MapContainer` with Leaflet 1.9.4,
OpenLayers 10.11 and MapLibre 6.15 adapters. All three use the same confirmed
sources, first-party controls, theme tokens and plain-text attribution.
Inline and fetched GeoJSON features, XYZ tiles, WMS and WMTS are supported.

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
local repeating synthetic grid, not a street map or geographic reference. Its
Basemap service selector also exercises local WMS and WMTS capabilities.

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
runtime `fetch` override applies to GeoJSON and capabilities requests; it does
not intercept tile
images. Serve authenticated tiles through an application-owned URL when custom
request headers are needed. Keep credentials out of configuration.

## WMS and WMTS services

Services confirm their CRS from capabilities rather than an application declaration:

```ts
import type { LayerConfig } from '@cii/maps';

const wms: LayerConfig = {
  id: 'cadastre',
  attribution: 'Your service provider’s required credit',
  source: {
    provider: 'wms',
    url: '/services/wms',
    layers: 'parcels,addresses',
    version: '1.3.0',
    crs: { fromMetadata: true, policy: 'prefer-display' }
  }
};

const wmts: LayerConfig = {
  id: 'imagery',
  attribution: 'Your imagery provider’s required credit',
  source: {
    provider: 'wmts',
    url: '/services/wmts',
    layer: 'orthophoto',
    matrixSet: 'GoogleMapsCompatible',
    crs: { fromMetadata: true, policy: 'prefer-display' }
  }
};
```

Use either source in the map's `layers` array. The URLs above are application
service placeholders. The providers request GetCapabilities and use the
advertised GetMap/GetTile endpoint or REST template, including relative links.
Probe and open share one request for each source input. Metadata is fetched
through the runtime `fetch` override with cancellation; image requests use the
browser's native tile loader. Cross-origin capabilities need CORS support.
Attribution remains application-supplied plain text, never service HTML.

The default `prefer-native` policy selects the first advertised candidate, since
these catalogues do not identify a preferred CRS. `prefer-display` selects the
display CRS when advertised, otherwise the first candidate. Confirmation retains
the capabilities document URL and the CRS element location. Common EPSG URNs,
OGC definition URLs and CRS:84 are normalised to registry codes. A declared
service CRS, unknown selected CRS or missing metadata is refused.

**WMS:** versions 1.1.1 and 1.3.0, HTTP GET and PNG/JPEG/WebP are supported.
CRSs are inherited through nested layers; multiple requested layers must share
the selected CRS. The renderer requests the display CRS only when every layer
advertises it. It uses `SRS` for 1.1.1 and `CRS` for 1.3.0, with latitude-first
EPSG:4326 BBOX order for 1.3.0 and longitude-first CRS:84. Current Leaflet
displays remain EPSG:3857, EPSG:4326 and OGC:CRS84. The server renders into the
requested CRS; the browser does not reproject a raster image. Requests use
256px tiles at native zooms 0–24 and server-selected default styles.
Fixed-size/non-subsettable layers and dimensions without advertised defaults are
refused. Custom styles, explicit time/elevation settings, POST and GetFeatureInfo
remain later work.

**WMTS:** version 1.0.0, HTTP GET KVP and advertised REST tile templates are
supported. The provider selects the named `layer` and, when supplied, its linked
`matrixSet`; otherwise it uses the first linked set matching the confirmed CRS.
It retains actual matrix identifiers, chooses the advertised default (or sole)
style, uses advertised dimension defaults and enforces tile-row/column limits.
Leaflet currently accepts contiguous levels of the standard 256px EPSG:3857
quadtree, within zooms 0–24. Different origins, scales, tile sizes or matrix
sizes are refused. Decimal scale-denominator rounding is recognised within a
relative tolerance of 1e-9 and origin rounding within one micrometre. No tiles
are requested outside advertised levels or limits. Custom grids, non-default
styles and explicit dimension selections remain later work.

Capabilities are bounded to 2 MiB of UTF-8 XML, 30,000 elements and 128 nesting
levels. Malformed XML, entity declarations and internal DTDs fail before tile
requests. External DTD declarations do not trigger network loading. HTTP and
service-exception responses fail with typed source/metadata errors; native tile
failures report `LAYER_LOAD_FAILED`. Reapply config to retry failed capabilities,
or hide/show an attached layer to retry tile images. Removing a source or
unmounting cancels its requests and releases native resources.

The implementation follows [WMS 1.3.0](https://docs.ogc.org/is/06-042/06-042.pdf)
and [WMTS 1.0.0](https://www.ogc.org/standards/wmts/). The synthetic fixtures test
these supported paths; they do not claim full OGC service certification.

## Declarative layers

<LayerExample />

Import `Layer` from `@cii/maps/svelte` and place it inside `MapContainer`.
Its required `spec: LayerSpec` contains an already opened `ResolvedSource`,
including confirmed CRS provenance. Use `resolveSourceCrs()` and the registered
provider's `open()` method to prepare it. For file/user declarations, use the
`CrsConfirm` workflow below first. `Layer` does not infer
CRS, open files, or initiate a metadata probe during SSR.

```svelte
<script lang="ts">
  import { Layer, MapContainer } from '@cii/maps/svelte';
  import type { LayerSpec, MapConfig } from '@cii/maps';

  let { site }: { site: LayerSpec } = $props();
  let visible = $state(true);
  const config: MapConfig = {
    engine: 'leaflet',
    view: {
      center: { crs: 'OGC:CRS84', coordinates: [151.21, -33.87] },
      zoom: 14
    },
    controls: [{ id: 'layer-list' }],
    layers: []
  };
</script>

<label><input type="checkbox" bind:checked={visible} /> Show site</label>
<MapContainer {config} label="Sites">
  <Layer spec={site} {visible} opacity={0.8} />
</MapContainer>
```

Declarations wait for their parent map to be ready. Each child owns its
registration until it is removed or unmounted. Source identity changes
(layer ID, provider, provider identity, confirmed CRS/axes/epoch/WKT) replace
the registration. Other changes patch it; replace source data immutably rather
than mutating provider-owned geometry. Optional `visible`, `opacity`, `order`
and `style` props override the corresponding spec fields when supplied.
Omitting them uses the spec's values and the normal layer defaults.

Child layers participate in the same layer list, plain-text attribution,
datum warnings, error notices and display-CRS preflight as config layers.
Changing the map config does not remove child registrations. Successful CRS
switches preserve their identity and provenance. Config and child layer IDs
share one namespace; duplicates are rejected without taking ownership of the
existing layer. Pending or failed child preparations block a CRS switch until
retried or removed.

`onerror` receives typed failures. Invalid props show an actionable child error;
asynchronous renderer failures appear in the parent map's error list. Correct
an invalid prop to retry its update. The exported component method `reload()`
retries the current renderer; access it through `bind:this`. Reloading does not
re-probe an already opened source. Unmounting cancels preparation and releases
late resources. Convenience source-specific components remain later work.

## Engines and projected displays

<MapEnginesExample />

Set `config.engine` to `leaflet`, `openlayers` or `maplibre`. The default
`createMapRuntime()` registers all three lazily; only the chosen engine loads
on mount. Install the selected engine's optional peer dependency in a consuming
application: `leaflet`, `ol`, or `maplibre-gl`. Engine changes require a keyed
remount, as the example demonstrates.

| Adapter | Display CRS | Raster behaviour |
| --- | --- | --- |
| Leaflet | Web Mercator, WGS 84/CRS84, configured metre projections with explicit grids | Tiles must match the display grid; WMS must advertise the display CRS. |
| OpenLayers | Registered horizontal CRS definitions, including MGA and NSW Lambert | XYZ and WMTS keep their native grids; OpenLayers reprojects raster tiles. WMS requests the advertised display CRS when available, otherwise its confirmed source CRS. |
| MapLibre | EPSG:3857 | Standard Web Mercator XYZ/WMTS and WMS advertising EPSG:3857. |

OpenLayers features are transformed from original source coordinates into the
display CRS by the core transform service. MapLibre receives geographic copies
from that same service. Original coordinates and confirmed CRS provenance stay
unchanged. Custom MapLibre projections remain unsupported, including with
`allowExperimental`; their earlier spike does not establish production support.
MapLibre requires WebGL and bundles its worker as a separate asset. Include the
worker asset when deploying the consuming application's build.

OpenLayers accepts explicit `view.resolution` without a tile matrix. Leaflet
needs an explicit metre grid for projected displays. Supply a definition with
that grid when creating the runtime; its origin and resolution levels must
match any tile service you intend to use:

```ts
import { createCrsRegistry } from '@cii/maps';
import { createMapRuntime } from '@cii/maps/svelte';

const mga = await createCrsRegistry().resolve('EPSG:7856');
const runtime = createMapRuntime({
  definitions: [{
    ...mga,
    tileMatrix: {
      // Synthetic example grid, not metadata for an actual tile service.
      origin: [0, 10_000_000],
      resolutions: Array.from(
        { length: 25 }, (_, zoom) => 10_000_000 / 256 / 2 ** zoom
      )
    }
  }]
});
```

Pass `{runtime}` to `MapContainer` and use `display: { crs: 'EPSG:7856' }`.
For example, `view.resolution: 10` means ten projected metres per CSS pixel.
No implicit grid, wrapping, datum shift or survey accuracy is inferred.
Configured definitions are copied into an instance-scoped registry before the
built-in definitions. Prepared transforms retain their definition snapshots.
The narrower `createLeafletRuntime()`, `createOpenLayersRuntime()` and
`createMapLibreRuntime()` factories remain available; the latter two also
include the adapters registered by the earlier factories.

## Runtime display CRS

<RuntimeCrsExample />

Change `config.display.crs` to switch an existing map. Keep layer and control
configuration unchanged during the switch; apply other edits separately first.
Supported targets depend on the adapter and its configured definitions.

```svelte
<script lang="ts">
  import { MapContainer } from '@cii/maps/svelte';
  import type { MapConfig } from '@cii/maps';

  // App-owned configuration with compatible feature or WMS layers.
  let { initialConfig }: { initialConfig: MapConfig } = $props();
  let displayCrs = $state('EPSG:3857');
  const config = $derived({
    ...initialConfig,
    display: { ...initialConfig.display, crs: displayCrs }
  });
</script>

<select aria-label="Display CRS" bind:value={displayCrs}>
  <option value="EPSG:3857">Web Mercator</option>
  <option value="EPSG:4326">WGS 84</option>
  <option value="OGC:CRS84">Longitude/latitude</option>
</select>
<MapContainer {config} label="Community sites" />
```

The switch transforms the live centre and preserves local horizontal scale,
layer identity, visibility, opacity, order, styles and source CRS provenance.
WMS requests use the advertised target CRS and its protocol axis order without
reconfirming the source. A replacement engine and all registered layers are
prepared before handoff. Failure leaves the previous map usable and reports
`DISPLAY_CRS_SWITCH_BLOCKED`; rapid requests discard obsolete replacements.
Zoom and layer controls pause during staging, while the old map remains usable.

On Leaflet and MapLibre, fixed-grid XYZ/WMTS layers can block a different
display even when hidden. OpenLayers can reproject these rasters.
Errors name incompatible layers. Remove incompatible registrations in a separate
update before retrying. Pending or failed layer preparations must finish or be
retried first. Retained edit targets participate in preflight through
`layers.retainStagedTarget(spec)`; call its returned release function when the
target is no longer retained. Capture and editing tools remain future work.

`ondisplaycrschange` receives `{ previous, current, view }` after a successful
handoff. `view` and `bind:view` then use the new display units; `onviewchange`
reports the transformed view with source `api`. `onready` runs again with the
replacement engine, so refresh any stored engine reference. Descendant controls
can use `getMapContext().setDisplayCrs(code)` and inspect `displayCrs` and
`switching`; synchronise app-owned display configuration with the callback.

An unchanged initial zoom declaration is not reapplied during switching. When
persisting a switched map for a new mount, save the callback's centre with the
new CRS and explicit `resolution`, rather than reusing an initial zoom in a CRS
without a tile matrix. Out-of-range Mercator centres are refused, not clipped.
Engine changes still require remounting.

## Scale and coordinate readout controls

Enable the first-party controls in map configuration:

```ts
import type { ControlConfig } from '@cii/maps';

const controls: ControlConfig[] = [
  { id: 'zoom' },
  { id: 'scale', position: 'bottom-left' },
  {
    id: 'coords',
    position: 'bottom-right',
    readoutCrs: 'EPSG:7856'
  }
];
```

Use that array as `config.controls`. The scale bar shows a readable metre or
kilometre distance, updating on zoom, pan and resize. It measures approximate
local ground distance at the map centre, with a spherical latitude correction
for Web Mercator and geographic degree units. It is not a survey measurement.
The bar uses at most 120 CSS pixels, shrinking for narrow viewports; sub-metre
distances remain labelled in metres. At a pole or an invalid centre, it reports
that scale is unavailable.

The coordinate control shows the pointer position in the display CRS plus the
configured `readoutCrs`. Omitting `readoutCrs` uses the display CRS and avoids a
duplicate line. The live example's Readout CRS selector switches between
longitude/latitude, MGA zone 56 and Web Mercator without rebuilding the map.
Unknown CRSs or unsupported transformations reject the configuration update;
the previous valid map stays intact. Control IDs must be unique. Only the
positions shown above are implemented for these controls; `readoutCrs` is valid
only on `coords`.

Geographic readouts use **longitude, latitude** in core x/y order, even for
EPSG:4326, with six decimal places. Projected readouts show X/Y in metres with
two decimal places. These digits describe display precision, not accuracy.
Conversions use the CRS service and retain its datum/ensemble/epoch warnings.
Different or unknown datums are labelled explicitly; no transformation accuracy
or survey alignment is certified.

Keyboard navigation uses the map centre. Pointer movement uses its current
screen location; a pan under a stationary pointer updates that location's
coordinates. Leaving the viewport returns to centre mode, and **Use map centre**
provides an explicit action. Moving into the map's control panel retains the
pointer location so it can be inspected or announced. Touch locations remain
until another pointer sample, keyboard navigation or an explicit centre action
replaces them. A position outside
the transform's domain clears the old coordinates and reports unavailability;
choosing the centre can recover a valid readout.

Automatic coordinate/scale updates are not live announcements. **Announce
coordinates** reads the current snapshot through a polite live region, including
the CRS, coordinate mode and accuracy caveat. This keeps pointer movement from
flooding screen readers, consistent with
[WCAG status-message guidance](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).
Both controls follow CII theme tokens. On compact maps, the controls move below
the canvas so their values stay visible; the configured canvas height is
retained. Short, wider maps can scroll their control panels. Keyboard focus can
reach every action. Pending animation frames
and engine subscriptions are released when controls change or the map unmounts.

## Source CRS confirmation

`CrsConfirm` is an optional input workflow before adding a layer. A hint never
confirms a file or inline source by itself. The form requires a registered CRS,
explicit axis order and a named declarer, followed by the confirmation button.
It shows detected hints and their source. Current inline/GeoJSON providers also
supply a raw sample coordinate and envelope, interpreted using the selected CRS
and axis order. The synthetic extent map is a preview, not an acceptance or an
accuracy certificate. Invalid coordinate previews block acceptance.

<CrsConfirmExample />

Use one runtime for the form and accepted map so a mismatch acknowledgement
reaches map reconciliation without applying to other sources:

```svelte
<script lang="ts">
  import '@cii/tokens/tokens.css';
  import {
    CrsConfirm, MapContainer, createLeafletRuntime
  } from '@cii/maps/svelte';
  import type { CrsConfirmation } from '@cii/maps/svelte';
  import type { MapConfig } from '@cii/maps';

  const runtime = createLeafletRuntime();
  const source = {
    provider: 'geojson' as const,
    url: '/data/sites.geojson'
  };
  let config = $state.raw<MapConfig | null>(null);

  function accept(result: CrsConfirmation<typeof source>) {
    const crs = result.source.crs;
    if (!('code' in crs)) return;
    config = {
      engine: 'leaflet',
      view: {
        center: { crs: 'OGC:CRS84', coordinates: [151.21, -33.87] },
        zoom: 13
      },
      layers: [{
        id: 'sites',
        attribution: 'Your data attribution',
        source: { ...result.source, crs }
      }]
    };
  }
</script>

<CrsConfirm {source} {runtime} onconfirm={accept} />
{#if config}
  <MapContainer
    {config} {runtime} label="Community sites"
    description="Provide the locations in an adjacent text list as well."
  />
{/if}
```

`source` accepts provider inputs with an optional `crs`; the form does not
open a
production layer. `onconfirm` receives `{ source, confirmed }`: a new source
with its declaration/metadata policy, plus the resolved record and provenance.
The original input is never mutated. The returned source remains suitable for
configuration validation; the runtime record itself is not written into JSON
configuration.

A differing hint, or WKT whose equivalence is unverified, shows a blocking
warning and a separate acknowledgement checkbox. Acknowledgement clears when
the source, declaration, axis order or declarer changes. The runtime records
only the exact JSON source/declaration and hint that were accepted; a sibling
source or changed metadata hint blocks again. These records are local to that
runtime and are not persisted across reloads. Call
`runtime.forgetConfirmation(result.source)` to revoke one. Do not enable the
legacy runtime-wide `acknowledgeHintMismatch` option for this workflow.

Service and database metadata inputs show advertised candidates, the selected
CRS and axis order, document/element or database provenance, and the
`prefer-native`/`prefer-display` selection policy. They do not offer a manual
service declaration. `displayCrs` defaults to EPSG:3857 and informs selection;
it does not change a mounted map's display. `requireDeclaration` lets a caller
force database declarations under its organisation policy. Providers without
sample/envelope metadata say that no preview is available; service footprints
and WKT equivalence detection are not inferred.

`declarer` can prefill an organisation/person name and `label` names the form.
The form still requires explicit acceptance. `onerror` reports failed probes
or errors applying a confirmation; field validation remains visible in the
form. Probing and preview work are cancelled when inputs change or the form
unmounts. Metadata failures expose a retry button. SSR renders a stable pending
state, with no network requests or browser map creation.

## Properties

| Property             | Type                                                 | Default                  |
| -------------------- | ---------------------------------------------------- | ------------------------ |
| `config`             | `MapConfig` (required)                               | —                        |
| `label`              | string (required)                                    | —                        |
| `description`        | string                                               | —                        |
| `height`             | CSS length                                           | `24rem`                  |
| `view`               | `ViewState`, bindable                                | —                        |
| `runtime`            | `MapRuntime`, read once when mounted                 | `createMapRuntime()`     |
| `children`           | Svelte snippet                                       | —                        |
| `onready`            | `(engine: IMapEngine) => void`                       | —                        |
| `ondisplaycrschange` | `(change: DisplayCrsChange) => void`                 | —                        |
| `onerror`            | `(error: MapError) => void`                          | —                        |
| `onviewchange`       | `(view: ViewState, source: 'api' \| 'user') => void` | —                        |

`MapContainer` accepts `class` and forwards HTML attributes, including `data-*`
and ARIA attributes, to its root section. Caller-provided `aria-describedby` IDs
are combined with the component description.

## Behaviour and accessibility

The canvas becomes tabbable after it is ready. Arrow keys pan and +/− zoom.
On OpenLayers and MapLibre, Shift + Right/Up rotates clockwise by 15°;
Shift + Left/Down rotates anticlockwise by 15°, keeping the centre and resolution
unchanged. The shortcut disclosure shows rotation help only when the active
engine supports it. Leaflet retains its existing arrow-key panning behaviour.
Rotation jumps immediately, including with reduced motion enabled. Zoom
controls have accessible names and visible focus styles; Tab leaves the map
normally. Reduced-motion settings disable inertia and animated view requests.
Attribution is always present and remote data attribution is rendered as text.

Changing data, visibility, opacity, order or base style updates the existing
map. Network requests are cancelled when superseded or unmounted, and pending
engine loads cannot call `onready` after teardown. The canvas resizes with its
container. `view` is bindable; view changes are also available through
`onviewchange`. Use `onready` to access the typed engine contract and `onerror`
for typed errors.

Engine changes require an explicit component remount. The initial `runtime`
prop can
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

Display support is listed in the adapter table above. A display CRS without a
registered tile matrix uses explicit `view.resolution` rather than zoom.
Unsupported display CRSs fail without fallback. GDA94/GDA2020 inputs can be
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

## Acceptance status

The [Phase 1 acceptance review](/design/mapping-phase-1-review/) records the
requirement evidence and remaining work. Native controls have minimum 24×24
pixel targets, and reduced-motion checks cover view requests, drag inertia and
OpenLayers pinch-rotation release. These automated checks do not establish WCAG
certification or contrast against an application's chosen raster basemaps.

The versioned snapshot API preserves applied configuration alongside historical
CRS provenance. Restoration validates the config and resolves sources again;
saved timestamps and mismatch acknowledgements do not confirm a source.
Manual accessibility and publication sign-off remain outstanding.

## Save and restore configuration

Use `bind:this` to call the component's `exportSnapshot()` method after all
layers have loaded. It returns a JSON-compatible `MapConfigSnapshot` with
`version: 1`, the applied `config`, and per-layer `provenance` records containing
`id`, `origin` (`config` or `declarative`) and the resolved `crs` record.

```svelte
<script lang="ts">
  import { MapContainer } from '@cii/maps/svelte';
  import { restoreMapConfigSnapshot } from '@cii/maps';
  import type { MapConfig, MapConfigSnapshot } from '@cii/maps';

  let { initialConfig }: { initialConfig: MapConfig } = $props();
  let config = $state(initialConfig);
  let map: { exportSnapshot(): MapConfigSnapshot } | undefined = $state();
  let generation = $state(0);
  let saved = $state('');
  let message = $state('');

  function save() {
    try {
      if (!map) return;
      saved = JSON.stringify(map.exportSnapshot());
      message = 'Configuration saved.';
    } catch {
      message = 'Wait for the map and every layer to load before saving.';
    }
  }

  function restore() {
    try {
      config = restoreMapConfigSnapshot(JSON.parse(saved));
      generation += 1;
      message = 'Restoring configuration and checking sources again.';
    } catch {
      message = 'The saved configuration is invalid or uses an unsupported version.';
    }
  }
</script>

<button onclick={save}>Save configuration</button>
<button onclick={restore} disabled={!saved}>Restore configuration</button>
<p role="status">{message}</p>
{#key generation}
  <MapContainer bind:this={map} {config} label="Saved community map" />
{/key}
```

The keyed remount creates a fresh default runtime. If you supply a custom
runtime, create a fresh one too so providers re-probe metadata and previous
runtime acknowledgements are not reused. Restoration returns validated
configuration only; source errors still reach the map's `onerror` and error
notices. A changed service catalogue may select a different CRS or fail current
compatibility checks. A hint mismatch requires renewed user acceptance through
`CrsConfirm`. Never pass historical provenance to `rememberConfirmation()`.

`validateMapConfigSnapshot()` validates and returns a detached snapshot for
inspection. It does not establish that historical provenance is authentic or
current. Unknown versions, malformed records, duplicate IDs and missing
configured-layer provenance fail with typed errors.

The export contains the last applied configuration. It does not capture local
pan/zoom or layer-control changes; keep those in application-owned configuration
when they must persist. Declarative child provenance is included for inspection,
but its opened source data and component registration are not restored. Recreate
those children through their normal source-confirmation workflow. Pending or
failed layers, active configuration updates and unmounted maps refuse export.

## Scope and limits

This slice supports base path styling, circle points, theme tokens and
XYZ/WMTS basemaps and WMS raster services. OpenLayers also supports the
capabilities-advertised WMTS grid and raster reprojection. Labels, icons,
data-driven rules, editing and custom MapLibre projections are not implemented
yet; unsupported options fail explicitly. GeoJSON reads are
bounded to 5 MiB, 10,000 features and 100,000 positions. Properties are treated
as data and never inserted as HTML.
