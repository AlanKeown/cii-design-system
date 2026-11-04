# @cii/maps

Initial Phase 0 foundations for the [mapping development plan](../../docs/svelte-mapping-components-development-plan.md). This private workspace package has no runtime dependencies and does not yet render maps.

Implemented:

- Ordered, instance-scoped extension registries with duplicate protection and registration cleanup.
- CRS definition providers with core and Australian packs registered through the public API. Australia is enabled by default and can be disabled explicitly.
- `resolveSourceCrs()` with declared versus metadata provenance, explicit hint mismatch acknowledgement, source axis order, and organisation policy for database declarations.
- Canonical resolution and logarithmic zoom conversion, with resolution precedence. A CRS without a tile matrix requires explicit resolution. Out-of-table zooms extrapolate using the nearest interval.
- `EngineView`, `FakeViewEngine`, and a reusable view conformance check exported from `@cii/maps/testing`.
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

The generated `MapConfig`/`SourceConfig` types are available from both `@cii/maps` and `@cii/maps/config`. The low-level resolver accepts `SourceInput` so third-party providers can still probe outside the built-in config schema. Validation does not confirm a CRS, fetch metadata, check engine capabilities, register a provider or enable capture. Those checks occur when the map is resolved and mounted. Provider-specific file contents, service options, full style rules and extension schema fragments remain to be implemented; the initial schema supports the plan's §12.5 example and the base portable style. Future source/control names in the schema describe configuration contracts, not implemented adapters or controls. Unknown engine IDs are allowed for registered extensions and are resolved by the future engine registry.

`src/config/map.schema.json` is the canonical source and is exported as `@cii/maps/config/schema.json`. Run `npm run generate:config -w @cii/maps` after edits. Workspace checks fail if the checked-in TypeScript types are stale. Builds, checks and tests also generate an ignored JavaScript validator with Ajv; builds copy it into `dist/config`. All authored implementation and tooling remains TypeScript, with strict checking and JavaScript source exclusion preserved. Generation uses [Ajv standalone compilation](https://ajv.js.org/standalone.html), so validation has no runtime Ajv import and works without dynamic code evaluation.

Still pending in Phase 0: extension schema merging, remaining typed subsystem registries, the full engine contract and fake, layer-manager runtime confirmation checks, transformation policies, real-engine version CI, and spikes S1–S8. The fake covers view semantics only, including fit extent and pixel round trips; it makes no rendering, event, CRS-switching, or capture conformance claims. No engine subpath is exported before its adapter exists.

No third-party runtime libraries have been added. Build tooling uses Ajv (MIT) for JSON Schema validation code generation and json-schema-to-typescript (MIT) for configuration types. CRS definitions come from PROJ's EPSG dataset; see [PROJ licensing](https://proj.org/en/stable/about.html#license).
