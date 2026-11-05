# Mapping Phase 0 evidence — 5 November 2026

Phase 0 remains open. D1–D6 are approved. The extension foundations and CI
workflow definitions are implemented. S1–S6 and S8 have reproducible local
experiments with the limitations below. S7 has installed-grid comparisons but
still needs the intended self-hosted and hosted Supabase environments. The
reports below record the measured feasibility results and their limits.

## Foundations

- `createRegistries()` provides instance-scoped engines, CRS providers, sources,
  renderers, controls, capture modes, validators, persistence adapters,
  exporters and style compilers. The Leaflet runtime uses this collection.
  Existing built-in source/CRS registration follows the same public methods as
  extensions.
- Typed extension contracts include target descriptors, per-operation geometry
  CRS, retained vertex provenance, atomic/partial commit results and persistence
  capabilities. These contracts do not implement production capture or writes.
- `@cii/maps/config/extensions` composes strict source/control schemas and
  namespaced `extensions[id]` settings. Fragments cannot replace core identity,
  CRS confirmation, attribution or editable-target rules. Conflicting IDs fail.
  The compiler is a Node/build entry point with an optional Ajv peer. Its
  standalone ESM output embeds required validation helpers and can be consumed
  with `validateConfigWith()` without runtime Ajv or dynamic code evaluation.
- The default `MapContainer` still consumes the built-in configuration schema.
  Extension-aware component orchestration and extension installation/version
  negotiation remain later work; schema acceptance does not register a renderer,
  load a provider or enable a control.
- `maps-leaflet.yml` defines a blocking 1.9.4 gate, a non-blocking pinned
  2.0.0-beta.1 probe and a weekly official development snapshot probe. Snapshot
  archives are identified by their SHA-256 in the job summary. Jobs include the
  currently implemented adapter/browser coverage and capture spike, not the
  future production capture conformance suite.
- `maps-spikes.yml` is a manual workflow for the heavier SQLite, PostGIS and
  pygeoapi measurements. The new workflows have not been run on GitHub; changes
  remain uncommitted and unpushed.

## Spike results

| Spike | Local result                                                            | Evidence and boundary                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1    | Pass for the synthetic MGA fixture                                      | MapLibre 6.15.0 renders MGA tiles, an MGA `{bbox}` WMS response, and worker-projected sketch points/polygon outlines within one pixel at map zoom 17/source zoom 18. This is not an external WMS interoperability test.                                                                                                                                                                                                     |
| S2    | Stable feasibility passes; migration differences recorded               | Leaflet 1.9.4 uses a first-party projected CRS factory. At zooms 12, 15.5 and 18 the Sydney oracle/feature residual is zero at the recorded precision, and round-trip error is below 1 mm. The spherical ground scale is within 0.5% of the local MGA grid. The alpha and beta fail through different CRS API changes. Production custom-CRS capability remains disabled.                                                   |
| S3    | Non-Mercator vector tile rendering supported in the tested cases        | OpenLayers 10.11.0 renders synthetic MGA56 MVT in MGA56 and reprojects it into MGA55. Canvas pixels at the expected location are checked. Map-level hit testing returns zero hits despite visible points in this harness; picking support is not established. Production compatibility rules remain conservative.                                                                                                           |
| S4    | Worker/OPFS measurements complete; routing policy approved              | Both readers open synthetic GeoPackages through 128 MiB in Chromium. Official SQLite streaming OPFS bounds measured WASM heap and input chunks. Full geometry decoding, peak memory, mobile limits and other browsers are unmeasured.                                                                                                                                                                                       |
| S5    | Pass for the retained-vertex polygon fixture                            | Real Leaflet, MapLibre and OpenLayers surfaces produce exactly equal change sets for a polygon snapped to canonical source vertices, with mouse/double-click and touch/Enter completion. Navigation zoom remains unchanged. Leaflet uses its production interaction surface; the other two use spike-only native surface bridges. Freehand numerical equality, pen input and production capture adapters are not certified. |
| S6    | `Content-Crs` and ETag concurrency ruled out for the tested combination | pygeoapi 0.23.3 + PostgreSQL provider + disposable PostGIS behind a local HTTP auth proxy: unauthenticated POST is 401; native POST is 201; a CRS84 POST is 201 but stores `[151.21,-33.87]` with SRID 7856; GET has no ETag; stale `If-Match` PUT is 204 and overwrites the row.                                                                                                                                           |
| S7    | Local installed-grid comparisons pass; deployment audits outstanding    | Two checksum-pinned Australian grids match explicit PostGIS/PROJ pipelines at Sydney, Melbourne, Canberra and Darwin within 1e-9 degrees. This neither audits target servers nor enables grids in the production browser transform service.                                                                                                                                                                                 |
| S8    | XY Polygon reconstruction prototype passes                              | A 1,000-vertex polygon produces identical SQL and batched adapter-A results. All 667 stored/snapped vertices equal their authoritative target coordinates exactly; stale stored-row versions fail. SQL and adapter-A wall times were approximately 185 ms and 110 ms, including Docker/psql startup and JSON transport.                                                                                                     |

Machine-readable measurements:

- [SQLite worker/OPFS](../packages/maps/tests/fixtures/sqlite-benchmark.json)
- [pygeoapi transaction probe](../packages/maps/tests/fixtures/oapif-probe.json)
- [Installed-grid comparisons](../packages/maps/tests/fixtures/grid-comparison.json)
- [Vertex reconstruction](../packages/maps/tests/fixtures/vertex-benchmark.json)

The CLI server experiments use a digest-pinned disposable PostGIS 3.5.2 / PROJ
7.2.1 image. S8 and installed-grid comparisons have networking disabled and no
host ports. S6 publishes only a random loopback database port and uses synthetic
data behind a loopback HTTP proxy. The runners remove only their own containers.
Existing application databases are not modified.

## Findings that affect implementation

**Retain target vertices after transforming freehand geometry.** Replacing a
stored target vertex in display CRS before transforming the whole polygon back
can introduce a numerical round trip. S8 instead transforms freehand geometry
into the target CRS, then replaces retained vertices with their authoritative
target coordinates. Both prototype paths enforce stored-row version checks.
Production code still needs authorised row lookup, locking, RLS, validity
checks, transaction/idempotency integration and support beyond the tested XY
Polygon.

**Keep adapter C restricted.** The tested pygeoapi provider assigns its storage
SRID to incoming coordinates without honouring `Content-Crs`; it also lacks the
observed ETag conflict check. A future adapter must explicitly describe these
capabilities, handle CRS conversion appropriately and require
`allowNonConformantPersistence`. A successful HTTP status does not prove either
capability.

**Prefer official SQLite for an OPFS path, with conservative routing.** At the
128 MiB sample, official SQLite's measured in-memory WASM heap was 162,267,136
bytes plus a 134,295,552-byte input buffer. OPFS used an 8,388,608-byte WASM
heap and input chunks up to 2,097,152 bytes. sql.js completed the same metadata
reads but did not expose a WASM heap snapshot through its public module object.
These are snapshots, not peak-memory measurements. Approved initial policy (5
November 2026): route files above 16 MiB to the server, allowing larger OPFS
imports only through an explicit application override when OPFS is available.
The shared `routeGeoPackageFile()` helper enforces this selection; production
GeoPackage parsing/loading remains Phase 2 work.

**Keep Leaflet 2 diagnostics separate from adoption.** The original alpha probe
fails because the object-copy custom CRS lacks inherited `latLngToPoint` after
Leaflet's class conversion. The beta probe fails because `CRS.Earth` is absent
at that path. These differences are recorded rather than hidden with
compatibility fallbacks. Production remains at 1.9.4. The pinned diagnostic now
uses beta.1 as listed on
[Leaflet's install page](https://leafletjs.com/install.html).

The official development snapshot also fails at `CRS.Earth`. The tested archive
SHA-256 is `4d9c783de01433d16efa52fcb7b855fcd084c328aa833ec3ba3319e7f9ada0fa`
([development release](https://github.com/Leaflet/Leaflet/releases/tag/dev)).

**Installed grid agreement does not establish deployment accuracy.** The CLI
owns its proj4 global grid registrations for the life of its process and checks
downloaded file sizes and SHA-256 values from the
[PROJ catalogue](https://cdn.proj.org/files.geojson). The production transform
service continues to reject named grids. A production integration must handle
registry isolation, bounded loading/caching, operation selection, out-of-grid
failures and provenance before it can be enabled. The sampled geographic
residuals are not ground-distance or survey-accuracy certification.

## Reproduce

```sh
npm run check
npm run build
npm test
npx playwright test --config playwright.maps.config.ts
npm run spike:sqlite -w @cii/maps
npm run spike:vertices -w @cii/maps
npm run spike:grids -w @cii/maps
```

The SQLite command generates ignored large fixtures. Grid files are verified in
a temporary cache and are not vendored. Docker is needed for the server/grid
experiments. To run pygeoapi, create an isolated Python 3.12 environment with
`packages/maps/spikes/pygeoapi-requirements.txt`, set `CII_PYGEOAPI_PYTHON` to
its Python executable, then run `npm run spike:oapif -w @cii/maps`.

For a deployment audit, configure an authorised read-only libpq service profile
outside the repository. Set `CII_MAPS_AUDIT_SERVICE` to that profile name and,
optionally, `CII_MAPS_AUDIT_LABEL` to a descriptive deployment name, then run:

```sh
npm run audit:target -w @cii/maps -- /tmp/mapping-target-audit.json
```

The audit forces read-only sessions, uses synthetic coordinates and does not
read application rows. It records versions, 40 browser/server comparisons and
named-grid probes. Default `ST_Transform` operation selection is not
introspected. Do not put passwords or connection strings into map config or this
report.

## Remaining exit work

1. Identify and audit both intended self-hosted and hosted Supabase targets.
2. Finish the S7 deployment report and resolve any additional conformance cases
   exposed by those environments.
3. Obtain remote CI results when the user authorises committing and pushing.

The wider Phase 1 display adapters, sources, controls and runtime CRS switching
remain separate implementation work.
