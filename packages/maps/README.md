# @cii/maps

Initial Phase 0 foundations for the [mapping development plan](../../docs/svelte-mapping-components-development-plan.md). This private workspace package has no runtime dependencies and does not yet render maps.

Implemented:

- Ordered, instance-scoped extension registries with duplicate protection and registration cleanup.
- CRS definition providers with core and Australian packs registered through the public API. Australia is enabled by default and can be disabled explicitly.
- `resolveSourceCrs()` with declared versus metadata provenance, explicit hint mismatch acknowledgement, source axis order, and organisation policy for database declarations.
- Canonical resolution and logarithmic zoom conversion, with resolution precedence. A CRS without a tile matrix requires explicit resolution. Out-of-table zooms extrapolate using the nearest interval.
- `EngineView`, `FakeViewEngine`, and a reusable view conformance check exported from `@cii/maps/testing`.

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

Still pending in Phase 0: canonical JSON Schema and generated config types, remaining typed subsystem registries, the full engine contract and fake, layer-manager runtime confirmation checks, transformation policies, real-engine version CI, and spikes S1–S8. The fake covers view semantics only, including fit extent and pixel round trips; it makes no rendering, event, CRS-switching, or capture conformance claims. No engine subpath is exported before its adapter exists.

No third-party runtime libraries have been added. CRS definitions come from PROJ's EPSG dataset; see [PROJ licensing](https://proj.org/en/stable/about.html#license).
