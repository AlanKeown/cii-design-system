# @cii/maps

Initial Phase 0 foundations for the [mapping development plan](../../docs/svelte-mapping-components-development-plan.md). This private workspace package uses proj4 as a runtime peer and does not yet render maps.

Implemented:

- Ordered, instance-scoped extension registries with duplicate protection and registration cleanup.
- CRS definition providers with core and Australian packs registered through the public API. Australia is enabled by default and can be disabled explicitly.
- A registry-backed horizontal display transform service for coordinates, geometries and feature batches, with explicit datum and epoch reporting.
- `resolveSourceCrs()` with declared versus metadata provenance, explicit hint mismatch acknowledgement, source axis order, and organisation policy for database declarations.
- Canonical resolution and logarithmic zoom conversion, with resolution precedence. A CRS without a tile matrix requires explicit resolution. Out-of-table zooms extrapolate using the nearest interval.
- The full `IMapEngine` contract: capabilities, mount/reconfigure/destroy, canonical view, typed events, layer handles, pointer/keyboard subscriptions, nested navigation suspension, sketch overlays, hit testing and the native escape hatch.
- An instance-scoped lazy `EngineRegistry`, plus `LayerManager` with registered renderers, runtime CRS confirmation and compatibility checks, queued registration, surgical patches and cancellable preparation.
- `FakeViewEngine`, `FakeMapEngine`, view/adapter conformance checks and deterministic interaction fixtures exported from `@cii/maps/testing`.
- A canonical draft-07 JSON Schema, generated TypeScript configuration types and standalone runtime validation, available from `@cii/maps/config`.

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

Providers supply the probe result; actual file readers and service metadata parsers are still to be built. Metadata confirmation requires `fromMetadata: true`. `prefer-native` is the default policy; `prefer-display` selects the display CRS when offered. If the preferred code is absent, the first advertised candidate is used. Providers must preserve advertised ordering and actual delivered axis order. Unknown CRS codes always fail.

Mismatch acknowledgement is a runtime option recorded in the confirmed provenance. WKT-only hints block unless a supplied `hintMatches` comparator confirms them or the mismatch is explicitly acknowledged. No WKT equivalence or datum transformation is inferred from projection strings.

The definition file is generated with local PROJ `projinfo` using `npm run generate:crs -w @cii/maps`, then formatted with Prettier. PROJ is not needed for normal builds or tests. Definitions include the geographic area of use and geodetic datum identity, not a projected tile extent. Only Web Mercator has a bundled tile matrix; custom grids must supply their own. GDA94 zone 59 is EPSG:6738, correcting the plan's original EPSG:28359 entry.

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

`prepare()` resolves explicit source and target codes through the supplied registry and compiles a reusable proj4 converter. There is no default CRS, global `proj4.defs()` registration, online lookup or fallback to proj4's built-in aliases. Prepared converters retain definition snapshots; a subsequent registry update applies to subsequently prepared converters. Definitions must contain horizontal PROJ strings; `CrsRef.wkt` does not override the registry.

Renderers can use `await transforms.forDisplay(source.crs, context.displayCrs.code)` with a `ConfirmedCrs`, then call `transform.features(batch)`. The lower-level `prepare()` also supports display-to-readout and display-to-geographic-base conversions where no input-source confirmation is involved. Both APIs consume and return **core x/y coordinates**. Providers must call `toCoreCoord()` when normalising delivered y/x data; the transform never applies that source-boundary swap a second time or enforces a definition's native latitude-first axis order.

`coordinate()` transforms a two-number pair; `position()` preserves any additional finite ordinates unchanged. `geometry()` covers every simple-feature geometry type and collections, and `features()` handles null geometries and preserves feature IDs. They copy coordinate arrays and geometry rather than overwriting source vertices. Attribute objects remain shared and read-only. Geometry helpers are coordinate walkers, not topology validators. There is no vertical or time-dependent transformation: XY calculations use proj4's 2D operation, and Z/M values are not fed into a 3D Helmert calculation. Invalid coordinates, geographic latitude, singular/non-finite results and malformed geometry fail with typed `MapError`s.

Every prepared transform exposes a serialisable `accuracy` snapshot: display tier, `authoritative: false`, horizontal-only dimensions, source/target datum metadata and optional epochs, datum relationship, operation category and warning codes. `horizontalAccuracyMetres` is always `null`: no input survey accuracy or globally valid operation accuracy is inferred from projection definitions or a successful round trip. Missing datum metadata gives `DATUM_UNKNOWN`; differing datum IDs give `DATUM_DIFFERENCE`; ensembles give `DATUM_ENSEMBLE`. Supplied coordinate epochs and dynamic datums give `EPOCH_NOT_APPLIED`. Datum identity comes from PROJ metadata, so matching GRS80 ellipsoids do not make GDA94 and GDA2020 the same datum. The bundled projection strings do not encode the GDA94/GDA2020 correction. WGS84 ensemble/web mapping limitations are described by [NSW Spatial Services](https://www.nsw.gov.au/environment-land-and-water/surveying/geodesy-and-geocentric-datum-of-australia/gda2020).

The default `datumPolicy: 'allow-display'` permits display output while reporting these limitations. `require-same-datum` refuses different or unknown datum identities; it does not certify survey accuracy, resolve an ensemble to one realisation, or apply epochs. An organisation can route precision-dependent work to its authoritative PostGIS pipeline. Named horizontal/vertical grids (including optional names followed by a null fallback) currently fail with `TRANSFORM_GRID_UNSUPPORTED`, rather than silently depending on global grid registration or omitting a correction. Only explicit null grids, as used by Web Mercator, are supported until vetted grid integration is added. Stored and snapped source vertices must remain in their original CRS for the server-side write path.

The projection tests retain 15 checked-in same-datum fixtures generated by local PROJ `cs2cs`, with a 1 mm tolerance in projected metres and reverse checks in degrees. Rebuild them with `npm run generate:transform-fixtures -w @cii/maps` after an intentional definition/oracle change. They cover Web Mercator, NSW Lambert and every bundled GDA94/GDA2020 MGA zone.

The separate [PostGIS accuracy baseline](tests/fixtures/accuracy-report.md) contains 40 reference cases generated with actual `ST_Transform` and `ST_TransformPipeline` calls: 32 same-datum comparisons (including off-meridian and inverse cases) and eight datum comparisons. The JSON records exact oracle/browser versions, source/target SRIDs, x/y conventions, explicit pipeline text where selected, grid-operation probes and measured residuals. The report is generated from those values and checked for drift. Default-operation numerical agreement and explicit GDA2020-aligned Web Mercator results are characterised separately; a discrepancy is not hidden by increasing projection tolerances. Residuals use target CRS units, and projected Mercator metres are not ground metres.

`npm run test:unit -w @cii/maps` validates the checked-in baseline without a database. `npm run test:accuracy -w @cii/maps` starts a fresh, digest-pinned PostGIS container with networking disabled, no host ports and temporary storage, compares live outputs and metadata, then removes only that container. CI runs this in a dedicated job. `npm run generate:accuracy-fixtures -w @cii/maps` intentionally regenerates the JSON and readable report; review both before accepting changes. Docker is required for these two live commands. Existing application databases are not modified.

The reference image currently uses PostGIS 3.5.2 and PROJ 7.2.1. Its two Australian grid probes cannot execute at the sample coordinate with networking disabled; this describes that reference image, not every deployment or every grid filename. Only explicit fixtures claim an exact pipeline; default `ST_Transform` operation selection is not introspected. These checks establish numerical agreement at the sampled points, not a survey-accuracy certification. Spike S7 still requires installed-grid comparisons and per-target-server pipeline/grid audits.

Build with `npm run build -w @cii/maps`; check with `npm run check -w @cii/maps`; test with `npm run test:unit -w @cii/maps`. The core imports without browser globals or engine dependencies. Node source consumers can enable the `development` condition; standard imports use the built JavaScript and declarations.

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

The validator accepts JSON values, applies display defaults to a copy and rejects unknown settings (including credentials). Files, inline data and tile conventions require a declared CRS; web services require metadata selection. PostGIS accepts either form to support organisation declaration policies. Every URL-backed layer, including a relative file URL, requires nonblank attribution. Duplicate layer IDs, missing snap layers, invalid view limits and capture targets that do not name editable PostGIS layers fail before source probing. Errors include structural diagnostics without submitted values.

The generated `MapConfig`/`SourceConfig` types are available from both `@cii/maps` and `@cii/maps/config`. The low-level resolver accepts `SourceInput` so third-party providers can still probe outside the built-in config schema. Validation does not confirm a CRS, fetch metadata, check engine capabilities, register a provider or enable capture. Those checks occur when the map is resolved and mounted. Provider-specific file contents, service options, full style rules and extension schema fragments remain to be implemented; the initial schema supports the plan's §12.5 example and the base portable style. Future source/control names in the schema describe configuration contracts, not implemented adapters or controls. Unknown engine IDs are allowed for registered extensions and are resolved explicitly through `EngineRegistry.create()`.

`src/config/map.schema.json` is the canonical source and is exported as `@cii/maps/config/schema.json`. Run `npm run generate:config -w @cii/maps` after edits. Workspace checks fail if the checked-in TypeScript types are stale. Builds, checks and tests also generate an ignored JavaScript validator with Ajv; builds copy it into `dist/config`. All authored implementation and tooling remains TypeScript, with strict checking and JavaScript source exclusion preserved. Generation uses [Ajv standalone compilation](https://ajv.js.org/standalone.html), so validation has no runtime Ajv import and works without dynamic code evaluation.

Engine and layer lifecycle:

- Register lazy engine module loaders through `EngineRegistry.register(id, loader)`; `create(id)` returns a fresh adapter and rejects missing or mismatched engine IDs. No production engine is imported implicitly. Adapters call `assertDisplayCrs()` at mount/reconfigure and must honour the experimental opt-in.
- A `ResolvedSource` carries its `ConfirmedCrs`, immutable source data, stable provider identity, render kind, explicit remote flag and spatial support metadata. `LayerManager.add()` rejects unconfirmed CRS records and invalid layer settings synchronously. Remote sources require attribution. Its confirmation guard checks structure and provenance; it cannot authenticate a caller-manufactured record, so normal inputs must still go through `resolveSourceCrs()`.
- Register every `LayerRenderer` in the manager's instance-scoped `Registry<LayerRenderer>` with key `engineId:renderKind`. `compatibility()` declares whether the renderer can prepare that source for the display. `prepare()` receives the display definition and an `AbortSignal`, returns engine-ready data, and optionally owns resources through `dispose()`. Feature renderers return `FeatureBatch`. Actual CRS transformation and service requests belong to these renderers/providers; no identity transform is assumed across CRSs.
- Spatial compatibility checks happen before adapter calls. Fixed grids require matching CRS, origin and resolution levels (a source may expose a subset of display levels). Raster reprojection requires an explicit engine capability and compatible renderer. Vector tiles cannot use that raster exception. WMS-like services must advertise a usable CRS. Unknown custom render kinds require explicit display-CRS support metadata and a registered renderer. Unsupported advanced styles fail in both base styles and rules.
- `add()` returns a `ManagedLayer` immediately, including before attachment. Its `status` is `queued`, `loading`, `ready`, `error` or `removed`. Mount the engine first, then call `manager.attach(engine, displayDefinition)` with the same definition. Registrations prepare in order; attach waits for additions/updates that extend its queue. A failed registration rejects its `ready` promise, calls its optional `onerror`, and lets the remaining queue continue. Synchronous validation errors throw directly.
- `setVisible()`, `setOpacity()`, `setOrder()` and `setStyle()` patch the current handle. `update(next)` diffs the spec; a new immutable data reference or spatial metadata change triggers preparation, followed by `setData()` for feature handles that support it, or replacement otherwise. Property updates made while loading apply to the eventual handle. `reload()` retries or refreshes the current source. Read the current `ready` promise after a reload/update/reattach. Source identity changes throw `LAYER_IDENTITY_CHANGED`; use `layerIdentityKey()` to drive remove/re-create in a component.
- `get(id)` and `list()` expose registrations. Specs are metadata snapshots; source data remains provider-owned and must be treated as immutable. `remove()` is idempotent. Removing, replacing, detaching or destroying releases handles and prepared resources. Late results from renderers that ignore cancellation are disposed and cannot resurrect removed layers. Failed preparations leave an existing rendered handle in place with status `error`, allowing explicit retry.
- `assertCanSwitchDisplayCrs(next, { stagedTargets })` is a read-only preflight that names incompatible registered layers and retained staged-edit targets in `DISPLAY_CRS_SWITCH_BLOCKED`. It does not switch the engine or transform view/capture state. A future map-state coordinator will perform the Phase 1 switch/rebuild transaction after preflight.
- `detach()` preserves registrations/settings for another mounted engine; `destroy()` permanently removes them. The manager never owns engine destruction. A component/coordinator must detach its manager and destroy its engine during unmount. Per-frame UI batching and reactive Svelte bindings will be added with `MapContainer`.

For adapter tests, mount `FakeMapEngine` with an inert `{ clientWidth, clientHeight }` object, then use `checkEngineConformance()` with an engine-ready layer. The harness uses a disposable mounted instance and destroys it. The fake supports view conversion, resize, layer patches, event delivery, nested suspension, sketch lifecycle and cleanup. `userSetView()`, `dispatchPointer()`, `dispatchKey()` and `setHitResults()` provide deterministic interaction fixtures. Hit fixtures filter visibility/layers/tolerance; they do not calculate spatial intersections. Rotation is explicitly unsupported. Reconfiguration uses numeric view fixtures, optionally returns `rebuild-required`, and requires managed layers to be detached before an in-place CRS change. The fake has no rendering or datum maths and cannot establish real-engine projection, browser gesture, capture or precision parity.

Still pending in Phase 0: extension schema merging, remaining typed subsystem registries, real-engine version CI, and spikes S1–S8. Vetted client grid integration, installed-grid comparisons and per-target-server PostGIS audits remain outstanding. Phase 1 adds production adapters, source renderers and Svelte components. No engine subpath is exported before its adapter exists.

Runtime peer: proj4 (`>=2.20.9 <3`, tested at 2.20.9; MIT), whose current runtime dependencies mgrs and wkt-parser are also MIT. Build tooling uses Ajv (MIT) for JSON Schema validation code generation and json-schema-to-typescript (MIT) for configuration types. CRS definitions come from PROJ's EPSG dataset; see [PROJ licensing](https://proj.org/en/stable/about.html#license).
