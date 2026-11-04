# @cii/maps

Initial Phase 0 foundations for the [mapping development plan](../../docs/svelte-mapping-components-development-plan.md). This private workspace package has no runtime dependencies and does not yet render maps.

Implemented:

- Ordered, instance-scoped extension registries with duplicate protection and registration cleanup.
- CRS definition providers with core and Australian packs registered through the public API. Australia is enabled by default and can be disabled explicitly.
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

The definition file is generated with local PROJ `projinfo` using `npm run generate:crs -w @cii/maps`, then formatted with Prettier. PROJ is not needed for normal builds or tests. Definitions include the geographic area of use, not a projected tile extent. Only Web Mercator has a bundled tile matrix; custom grids must supply their own. GDA94 zone 59 is EPSG:6738, correcting the plan's original EPSG:28359 entry. No coordinate transformation or survey accuracy guarantee is implemented yet.

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

Still pending in Phase 0: extension schema merging, remaining typed subsystem registries, CRS transformation policies, real-engine version CI, and spikes S1–S8. Phase 1 adds production adapters, source renderers and Svelte components. No engine subpath is exported before its adapter exists.

No third-party runtime libraries have been added. Build tooling uses Ajv (MIT) for JSON Schema validation code generation and json-schema-to-typescript (MIT) for configuration types. CRS definitions come from PROJ's EPSG dataset; see [PROJ licensing](https://proj.org/en/stable/about.html#license).
