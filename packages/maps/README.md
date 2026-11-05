# @cii/maps

Foundations and the first read-only rendering slice for the
[mapping development plan](../../docs/svelte-mapping-components-development-plan.md).
This private workspace package now renders inline and fetched GeoJSON with
Leaflet 1.9.4 through an SSR-safe Svelte component.

```svelte
<script lang="ts">
  import '@cii/tokens/tokens.css';
  import { MapContainer } from '@cii/maps/svelte';
  import type { MapConfig } from '@cii/maps';

  const config: MapConfig = {
    engine: 'leaflet',
    view: {
      center: { crs: 'OGC:CRS84', coordinates: [151.21, -33.87] },
      zoom: 14
    },
    layers: [
      {
        id: 'sites',
        attribution: 'Application data',
        source: {
          provider: 'geojson',
          url: '/sites.geojson',
          crs: {
            code: 'OGC:CRS84',
            provenance: { kind: 'declared', by: 'application' }
          }
        }
      }
    ]
  };
</script>

<MapContainer {config} label="Community sites" />
```

Install the `@cii/svelte` and Svelte peers and import `@cii/tokens/tokens.css`
once in the application. `@cii/tokens` is a direct dependency. Default feature
colours use `--cii-map-feature`, which changes from navy to light purple with
the theme. Missing colour tokens are reported as layer style errors. Root HTML
attributes and `class` are forwarded; description IDs are combined. Errors show
recovery guidance and configuration paths, while `onerror` retains typed
diagnostic details.

The component includes Leaflet CSS, first-party zoom controls, keyboard
navigation, resize observation, mandatory text attribution, typed errors and
datum warnings. Provide a text alternative for map content. `view` is bindable;
`onready`, `onviewchange` and `onerror` expose lifecycle events.
`getMapContext()` supplies descendants with the engine and layer manager. The
initial `runtime` prop accepts `createLeafletRuntime({ fetch })` for app-owned
requests and registries. Keep credentials out of serialised config.

`@cii/maps/leaflet` exports the adapter as its default export; it imports
Leaflet only during mounting. It supports native EPSG:3857, EPSG:4326 and
OGC:CRS84 display, with explicit resolution required when no tile matrix is
registered. Features retain original source coordinates, normalise declared
source axis order once, and transform into the display's geographic base for
Leaflet. Cross-datum display is reported without claiming survey accuracy.
Native same-zoom pans round the centre to CSS pixels; `getView()` reports the
resulting centre. Web Mercator polar features outside Leaflet's latitude range
fail instead of being clipped.

Config updates reconcile existing layers and preserve the map and user view for
visual-only changes. Superseded requests and unmounts cancel pending work.
Engine/display changes require remounting in this slice. Base paths, circle
points and CII colour tokens are supported; raster basemaps, custom projected
displays, labels, icons, rules, capture and other controls remain pending and
fail explicitly. GeoJSON reads are limited to 5 MiB, 10,000 features and 100,000
positions; hit testing currently scans the bounded feature set without a spatial
index. See the
[working documentation example](../../apps/docs/src/routes/components/map/+page.md).

Install Leaflet (`>=1.9.4 <2`) and Svelte 5 for the rendering entry points; they
are optional peers for core-only consumers. Run
`npx playwright test --project maps` for real Chromium adapter, update,
cancellation, interaction, theming and teardown checks.

Implemented:

- Ordered, instance-scoped extension registries with duplicate protection and
  registration cleanup.
- CRS definition providers with core and Australian packs registered through the
  public API. Australia is enabled by default and can be disabled explicitly.
- A registry-backed horizontal display transform service for coordinates,
  geometries and feature batches, with explicit datum and epoch reporting.
- `resolveSourceCrs()` with declared versus metadata provenance, explicit hint
  mismatch acknowledgement, source axis order, and organisation policy for
  database declarations.
- Canonical resolution and logarithmic zoom conversion, with resolution
  precedence. A CRS without a tile matrix requires explicit resolution.
  Out-of-table zooms extrapolate using the nearest interval.
- The full `IMapEngine` contract: capabilities, mount/reconfigure/destroy,
  canonical view, typed events, layer handles, pointer/keyboard subscriptions,
  nested navigation suspension, sketch overlays, hit testing and the native
  escape hatch.
- An instance-scoped lazy `EngineRegistry`, plus `LayerManager` with registered
  renderers, runtime CRS confirmation and compatibility checks, queued
  registration, surgical patches and cancellable preparation.
- `FakeViewEngine`, `FakeMapEngine`, view/adapter conformance checks and
  deterministic interaction fixtures exported from `@cii/maps/testing`.
- A canonical draft-07 JSON Schema, generated TypeScript configuration types and
  standalone runtime validation, available from `@cii/maps/config`.

```ts
import { createCrsRegistry, Registry, resolveSourceCrs } from '@cii/maps';
import type { SourceProvider } from '@cii/maps';

const sources = new Registry<SourceProvider>();
sources.register('inline', {
  crsMode: 'declared',
  probe: async () => ({ kind: 'hint' })
});

const result = await resolveSourceCrs(
  {
    provider: 'inline',
    crs: {
      code: 'EPSG:7856',
      provenance: { kind: 'declared', by: 'application' }
    }
  },
  { sources, crsRegistry: createCrsRegistry(), displayCrs: 'EPSG:3857' }
);

if (!result.ok) throw result.error;
console.log(result.value.crs, result.value.provenance);
```

Providers supply the probe result; inline and GeoJSON readers now exist, while
other file readers and service metadata parsers remain pending. Metadata
confirmation requires `fromMetadata: true`. `prefer-native` is the default
policy; `prefer-display` selects the display CRS when offered. If the preferred
code is absent, the first advertised candidate is used. Providers must preserve
advertised ordering and actual delivered axis order. Unknown CRS codes always
fail.

Mismatch acknowledgement is a runtime option recorded in the confirmed
provenance. WKT-only hints block unless a supplied `hintMatches` comparator
confirms them or the mismatch is explicitly acknowledged. No WKT equivalence or
datum transformation is inferred from projection strings.

The definition file is generated with local PROJ `projinfo` using
`npm run generate:crs -w @cii/maps`, then formatted with Prettier. PROJ is not
needed for normal builds or tests. Definitions include the geographic area of
use and geodetic datum identity, not a projected tile extent. Only Web Mercator
has a bundled tile matrix; custom grids must supply their own. GDA94 zone 59 is
EPSG:6738, correcting the plan's original EPSG:28359 entry.

Display transforms:

```ts
import { createCrsRegistry, createTransformService } from '@cii/maps';

const transforms = createTransformService(createCrsRegistry());
const transform = await transforms.prepare({
  source: 'EPSG:7844',
  target: 'EPSG:7856',
  datumPolicy: 'require-same-datum'
});

const projected = transform.coordinate([151.21, -33.87]);
console.log(projected, transform.accuracy);
```

`prepare()` resolves explicit source and target codes through the supplied
registry and compiles a reusable proj4 converter. There is no default CRS,
global `proj4.defs()` registration, online lookup or fallback to proj4's
built-in aliases. Prepared converters retain definition snapshots; a subsequent
registry update applies to subsequently prepared converters. Definitions must
contain horizontal PROJ strings; `CrsRef.wkt` does not override the registry.

Renderers can use
`await transforms.forDisplay(source.crs, context.displayCrs.code)` with a
`ConfirmedCrs`, then call `transform.features(batch)`. The lower-level
`prepare()` also supports display-to-readout and display-to-geographic-base
conversions where no input-source confirmation is involved. Both APIs consume
and return **core x/y coordinates**. Providers must call `toCoreCoord()` when
normalising delivered y/x data; the transform never applies that source-boundary
swap a second time or enforces a definition's native latitude-first axis order.

`coordinate()` transforms a two-number pair; `position()` preserves any
additional finite ordinates unchanged. `geometry()` covers every simple-feature
geometry type and collections, and `features()` handles null geometries and
preserves feature IDs. They copy coordinate arrays and geometry rather than
overwriting source vertices. Attribute objects remain shared and read-only.
Geometry helpers are coordinate walkers, not topology validators. There is no
vertical or time-dependent transformation: XY calculations use proj4's 2D
operation, and Z/M values are not fed into a 3D Helmert calculation. Invalid
coordinates, geographic latitude, singular/non-finite results and malformed
geometry fail with typed `MapError`s.

Every prepared transform exposes a serialisable `accuracy` snapshot: display
tier, `authoritative: false`, horizontal-only dimensions, source/target datum
metadata and optional epochs, datum relationship, operation category and warning
codes. `horizontalAccuracyMetres` is always `null`: no input survey accuracy or
globally valid operation accuracy is inferred from projection definitions or a
successful round trip. Missing datum metadata gives `DATUM_UNKNOWN`; differing
datum IDs give `DATUM_DIFFERENCE`; ensembles give `DATUM_ENSEMBLE`. Supplied
coordinate epochs and dynamic datums give `EPOCH_NOT_APPLIED`. Datum identity
comes from PROJ metadata, so matching GRS80 ellipsoids do not make GDA94 and
GDA2020 the same datum. The bundled projection strings do not encode the
GDA94/GDA2020 correction. WGS84 ensemble/web mapping limitations are described
by
[NSW Spatial Services](https://www.nsw.gov.au/environment-land-and-water/surveying/geodesy-and-geocentric-datum-of-australia/gda2020).

The default `datumPolicy: 'allow-display'` permits display output while
reporting these limitations. `require-same-datum` refuses different or unknown
datum identities; it does not certify survey accuracy, resolve an ensemble to
one realisation, or apply epochs. An organisation can route precision-dependent
work to its authoritative PostGIS pipeline. Named horizontal/vertical grids
(including optional names followed by a null fallback) currently fail with
`TRANSFORM_GRID_UNSUPPORTED`, rather than silently depending on global grid
registration or omitting a correction. Only explicit null grids, as used by Web
Mercator, are supported until vetted grid integration is added. Stored and
snapped source vertices must remain in their original CRS for the server-side
write path.

The projection tests retain 15 checked-in same-datum fixtures generated by local
PROJ `cs2cs`, with a 1 mm tolerance in projected metres and reverse checks in
degrees. Rebuild them with `npm run generate:transform-fixtures -w @cii/maps`
after an intentional definition/oracle change. They cover Web Mercator, NSW
Lambert and every bundled GDA94/GDA2020 MGA zone.

The separate [PostGIS accuracy baseline](tests/fixtures/accuracy-report.md)
contains 40 reference cases generated with actual `ST_Transform` and
`ST_TransformPipeline` calls: 32 same-datum comparisons (including off-meridian
and inverse cases) and eight datum comparisons. The JSON records exact
oracle/browser versions, source/target SRIDs, x/y conventions, explicit pipeline
text where selected, grid-operation probes and measured residuals. The report is
generated from those values and checked for drift. Default-operation numerical
agreement and explicit GDA2020-aligned Web Mercator results are characterised
separately; a discrepancy is not hidden by increasing projection tolerances.
Residuals use target CRS units, and projected Mercator metres are not ground
metres.

`npm run test:unit -w @cii/maps` validates the checked-in baseline without a
database. `npm run test:accuracy -w @cii/maps` starts a fresh, digest-pinned
PostGIS container with networking disabled, no host ports and temporary storage,
compares live outputs and metadata, then removes only that container. CI runs
this in a dedicated job. `npm run generate:accuracy-fixtures -w @cii/maps`
intentionally regenerates the JSON and readable report; review both before
accepting changes. Docker is required for these two live commands. Existing
application databases are not modified.

The reference image currently uses PostGIS 3.5.2 and PROJ 7.2.1. Its two
Australian grid probes cannot execute at the sample coordinate with networking
disabled; this describes that reference image, not every deployment or every
grid filename. Only explicit fixtures claim an exact pipeline; default
`ST_Transform` operation selection is not introspected. These checks establish
numerical agreement at the sampled points, not a survey-accuracy certification.
Spike S7 still requires installed-grid comparisons and per-target-server
pipeline/grid audits.

Build with `npm run build -w @cii/maps`; check with
`npm run check -w @cii/maps`; test with `npm run test:unit -w @cii/maps`. The
core imports without browser globals or engine dependencies. Node source
consumers can enable the `development` condition; standard imports use the built
JavaScript and declarations.

Configuration validation:

```ts
import { validateMapConfig } from '@cii/maps/config';

const result = validateMapConfig({
  engine: 'openlayers',
  view: {
    center: { crs: 'OGC:CRS84', coordinates: [151.21, -33.87] },
    zoom: 12
  },
  layers: []
});

if (!result.ok) throw result.error;
console.log(result.value.display.crs); // EPSG:3857
```

The validator accepts JSON values, applies display defaults to a copy and
rejects unknown settings (including credentials). Files, inline data and tile
conventions require a declared CRS; web services require metadata selection.
PostGIS accepts either form to support organisation declaration policies. Every
URL-backed layer, including a relative file URL, requires nonblank attribution.
Duplicate layer IDs, missing snap layers, invalid view limits and capture
targets that do not name editable PostGIS layers fail before source probing.
Errors include structural diagnostics without submitted values.

The generated `MapConfig`/`SourceConfig` types are available from both
`@cii/maps` and `@cii/maps/config`. The low-level resolver accepts `SourceInput`
so third-party providers can still probe outside the built-in config schema.
Validation does not confirm a CRS, fetch metadata, check engine capabilities,
register a provider or enable capture. Those checks occur when the map is
resolved and mounted. Provider-specific file contents, service options, full
style rules and extension schema fragments remain to be implemented; the initial
schema supports the plan's §12.5 example and the base portable style. Future
source/control names in the schema describe configuration contracts, not
implemented adapters or controls. Unknown engine IDs are allowed for registered
extensions and are resolved explicitly through `EngineRegistry.create()`.

`src/config/map.schema.json` is the canonical source and is exported as
`@cii/maps/config/schema.json`. Run `npm run generate:config -w @cii/maps` after
edits. Workspace checks fail if the checked-in TypeScript types are stale.
Builds, checks and tests also generate an ignored JavaScript validator with Ajv;
builds copy it into `dist/config`. All authored implementation and tooling
remains TypeScript, with strict checking and JavaScript source exclusion
preserved. Generation uses
[Ajv standalone compilation](https://ajv.js.org/standalone.html), so validation
has no runtime Ajv import and works without dynamic code evaluation.

Engine and layer lifecycle:

- Register lazy engine module loaders through
  `EngineRegistry.register(id, loader)`; `create(id)` returns a fresh adapter
  and rejects missing or mismatched engine IDs. No production engine is imported
  implicitly. Adapters call `assertDisplayCrs()` at mount/reconfigure and must
  honour the experimental opt-in.
- A `ResolvedSource` carries its `ConfirmedCrs`, immutable source data, stable
  provider identity, render kind, explicit remote flag and spatial support
  metadata. `LayerManager.add()` rejects unconfirmed CRS records and invalid
  layer settings synchronously. Remote sources require attribution. Its
  confirmation guard checks structure and provenance; it cannot authenticate a
  caller-manufactured record, so normal inputs must still go through
  `resolveSourceCrs()`.
- Register every `LayerRenderer` in the manager's instance-scoped
  `Registry<LayerRenderer>` with key `engineId:renderKind`. `compatibility()`
  declares whether the renderer can prepare that source for the display.
  `prepare()` receives the display definition and an `AbortSignal`, returns
  engine-ready data, and optionally owns resources through `dispose()`. Feature
  renderers return `FeatureBatch`. Actual CRS transformation and service
  requests belong to these renderers/providers; no identity transform is assumed
  across CRSs.
- Spatial compatibility checks happen before adapter calls. Fixed grids require
  matching CRS, origin and resolution levels (a source may expose a subset of
  display levels). Raster reprojection requires an explicit engine capability
  and compatible renderer. Vector tiles cannot use that raster exception.
  WMS-like services must advertise a usable CRS. Unknown custom render kinds
  require explicit display-CRS support metadata and a registered renderer.
  Unsupported advanced styles fail in both base styles and rules.
- `add()` returns a `ManagedLayer` immediately, including before attachment. Its
  `status` is `queued`, `loading`, `ready`, `error` or `removed`. Mount the
  engine first, then call `manager.attach(engine, displayDefinition)` with the
  same definition. Registrations prepare in order; attach waits for
  additions/updates that extend its queue. A failed registration rejects its
  `ready` promise, calls its optional `onerror`, and lets the remaining queue
  continue. Synchronous validation errors throw directly.
- `setVisible()`, `setOpacity()`, `setOrder()` and `setStyle()` patch the
  current handle. `update(next)` diffs the spec; a new immutable data reference
  or spatial metadata change triggers preparation, followed by `setData()` for
  feature handles that support it, or replacement otherwise. Property updates
  made while loading apply to the eventual handle. `reload()` retries or
  refreshes the current source. Read the current `ready` promise after a
  reload/update/reattach. Source identity changes throw
  `LAYER_IDENTITY_CHANGED`; use `layerIdentityKey()` to drive remove/re-create
  in a component.
- `get(id)` and `list()` expose registrations. Specs are metadata snapshots;
  source data remains provider-owned and must be treated as immutable.
  `remove()` is idempotent. Removing, replacing, detaching or destroying
  releases handles and prepared resources. Late results from renderers that
  ignore cancellation are disposed and cannot resurrect removed layers. Failed
  preparations leave an existing rendered handle in place with status `error`,
  allowing explicit retry.
- `assertCanSwitchDisplayCrs(next, { stagedTargets })` is a read-only preflight
  that names incompatible registered layers and retained staged-edit targets in
  `DISPLAY_CRS_SWITCH_BLOCKED`. It does not switch the engine or transform
  view/capture state. A future map-state coordinator will perform the Phase 1
  switch/rebuild transaction after preflight.
- `detach()` preserves registrations/settings for another mounted engine;
  `destroy()` permanently removes them. The manager never owns engine
  destruction. `MapContainer` owns both lifecycles, reactive config
  reconciliation and resize observation. Further per-frame UI batching remains
  pending.

For adapter tests, mount `FakeMapEngine` with an inert
`{ clientWidth, clientHeight }` object, then use `checkEngineConformance()` with
an engine-ready layer. The harness uses a disposable mounted instance and
destroys it. The fake supports view conversion, resize, layer patches, event
delivery, nested suspension, sketch lifecycle and cleanup. `userSetView()`,
`dispatchPointer()`, `dispatchKey()` and `setHitResults()` provide deterministic
interaction fixtures. Hit fixtures filter visibility/layers/tolerance; they do
not calculate spatial intersections. Rotation is explicitly unsupported.
Reconfiguration uses numeric view fixtures, optionally returns
`rebuild-required`, and requires managed layers to be detached before an
in-place CRS change. The fake has no rendering or datum maths and cannot
establish real-engine projection, browser gesture, capture or precision parity.

Phase 0 follow-up now includes the shared `createRegistries()` collection,
strict extension schema composition at `@cii/maps/config/extensions`, Leaflet
version workflow definitions and reproducible engine/storage/server spikes. See
[the evidence and remaining exit work](../../docs/mapping-phase-0-spike-report.md).
D1–D6 and the initial GeoPackage routing policy are approved; target-server
audits, report acceptance and remote CI results remain outstanding. Production
client grid integration is still disabled. Spike-only MapLibre/OpenLayers
bridges, capture and custom Leaflet CRS construction do not expand the
production adapter's capabilities.

`createRegistries({ australia, fetch })` exposes engines, CRS providers, data
sources, renderers, controls, capture modes, validators, persistence adapters,
exporters and style compilers. The Leaflet runtime registers its engine and
feature renderer through that collection. Empty registries describe extension
slots, not implemented controls/capture/persistence features.

The extension compiler is a Node/build entry point requiring the optional Ajv
peer. `createExtendedMapConfigValidator(fragments)` validates registered source
and control config branches plus namespaced `extensions[id]` settings.
`compileExtendedMapConfigValidator(fragments)` emits a standalone ESM predicate;
pass that predicate to `validateConfigWith()` for JSON-boundary, defaults and
cross-reference checks without runtime Ajv or dynamic code evaluation. Core
identity, CRS declarations, attribution and editable-target rules remain
enforced. Fragments are trusted application code and cannot resolve external
schema URLs. The default `MapContainer` still uses the built-in schema;
extension-aware component orchestration and versioned extension installation
remain later work.

Runtime peer: proj4 (`>=2.20.9 <3`, tested at 2.20.9; MIT), whose current
runtime dependencies mgrs and wkt-parser are also MIT. Build tooling uses Ajv
(MIT) for JSON Schema validation code generation and json-schema-to-typescript
(MIT) for configuration types. CRS definitions come from PROJ's EPSG dataset;
see [PROJ licensing](https://proj.org/en/stable/about.html#license).

Phase 0 development dependencies, isolated from production exports: MapLibre GL
JS 6.15.0 (BSD-3-Clause) and OpenLayers 10.11.0 (BSD-2-Clause) exercise actual
rendering/interaction surfaces; official SQLite WASM 3.54.1-build1 (Apache-2.0
package wrapper, upstream SQLite public domain) and sql.js 1.15.2 (MIT) compare
worker readers; GeoTIFF 3.1.0-beta.0 (MIT) decodes checksum-pinned Australian
shift grids in the CLI comparison. None provide library controls. The optional
Python test environment is pinned separately in
`spikes/pygeoapi-requirements.txt`.

`routeGeoPackageFile(fileBytes, { opfsAvailable, opfsLimitBytes })` implements
the approved 16 MiB browser-memory default. Above that, files route to the
server unless the application explicitly supplies a fitting OPFS byte limit and
OPFS is available. This pure selection helper does not load a GeoPackage or
confirm its CRS; those provider features remain Phase 2 work.
