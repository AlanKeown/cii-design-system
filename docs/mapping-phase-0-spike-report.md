# Mapping Phase 0 evidence — 5 November 2026

**Phase 0 complete — 5 November 2026.** The foundation implementation and S1–S8
feasibility reports have been reviewed for the initial deployment scope. D1–D6
and the 16 MiB GeoPackage routing policy are recorded. Supabase is the initial
hosted target; the digest-pinned disposable PostGIS instance is the local and
self-hosted development reference. Another self-hosted deployment will need its
own audit when selected. Measured unsupported operations remain explicit
capability limits, not silently substituted transformations.

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
  pygeoapi measurements. The committed foundation baseline has passed the hosted
  Verify and stable Leaflet workflows. The new closeout regression is locally
  validated and remains uncommitted; it has not run on GitHub yet.

## Spike results

| Spike | Local result                                                               | Evidence and boundary                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1    | Pass for the synthetic MGA fixture                                         | MapLibre 6.15.0 renders MGA tiles, an MGA `{bbox}` WMS response, and worker-projected sketch points/polygon outlines within one pixel at map zoom 17/source zoom 18. This is not an external WMS interoperability test.                                                                                                                                                                                                     |
| S2    | Stable feasibility passes; migration differences recorded                  | Leaflet 1.9.4 uses a first-party projected CRS factory. At zooms 12, 15.5 and 18 the Sydney oracle/feature residual is zero at the recorded precision, and round-trip error is below 1 mm. The spherical ground scale is within 0.5% of the local MGA grid. The alpha and beta fail through different CRS API changes. Production custom-CRS capability remains disabled.                                                   |
| S3    | Non-Mercator vector tile rendering supported in the tested cases           | OpenLayers 10.11.0 renders synthetic MGA56 MVT in MGA56 and reprojects it into MGA55. Canvas pixels at the expected location are checked. Map-level hit testing returns zero hits despite visible points in this harness; picking support is not established. Production compatibility rules remain conservative.                                                                                                           |
| S4    | Worker/OPFS measurements complete; routing policy approved                 | Both readers open synthetic GeoPackages through 128 MiB in Chromium. Official SQLite streaming OPFS bounds measured WASM heap and input chunks. Full geometry decoding, peak memory, mobile limits and other browsers are unmeasured.                                                                                                                                                                                       |
| S5    | Pass for the retained-vertex polygon fixture                               | Real Leaflet, MapLibre and OpenLayers surfaces produce exactly equal change sets for a polygon snapped to canonical source vertices, with mouse/double-click and touch/Enter completion. Navigation zoom remains unchanged. Leaflet uses its production interaction surface; the other two use spike-only native surface bridges. Freehand numerical equality, pen input and production capture adapters are not certified. |
| S6    | `Content-Crs` and ETag concurrency ruled out for the tested combination    | pygeoapi 0.23.3 + PostgreSQL provider + disposable PostGIS behind a local HTTP auth proxy: unauthenticated POST is 401; native POST is 201; a CRS84 POST is 201 but stores `[151.21,-33.87]` with SRID 7856; GET has no ETag; stale `If-Match` PUT is 204 and overwrites the row.                                                                                                                                           |
| S7    | Complete for the initial deployment scope, with measured capability limits | Installed-grid CLI comparisons pass at eight samples. Hosted Supabase runs 38/40 comparisons (all 32 same-datum cases pass), lacks ST_TransformPipeline, and fails both explicit named-grid operations. The pinned local development reference runs all 40 cases; its schema-aware audit and capability refusals are regression-tested. Production browser grids remain disabled.                                           |
| S8    | XY Polygon reconstruction prototype passes                                 | A 1,000-vertex polygon produces identical SQL and batched adapter-A results. All 667 stored/snapped vertices equal their authoritative target coordinates exactly; stale stored-row versions fail. SQL and adapter-A wall times were approximately 161 ms and 99 ms, including Docker/psql startup and JSON transport.                                                                                                      |

Machine-readable measurements:

- [SQLite worker/OPFS](../packages/maps/tests/fixtures/sqlite-benchmark.json)
- [pygeoapi transaction probe](../packages/maps/tests/fixtures/oapif-probe.json)
- [Installed-grid comparisons](../packages/maps/tests/fixtures/grid-comparison.json)
- [Vertex reconstruction](../packages/maps/tests/fixtures/vertex-benchmark.json)
- [Hosted Supabase target audit](../packages/maps/tests/fixtures/supabase-target-audit.json)
- [Schema-aware local reference audit](../packages/maps/tests/fixtures/local-target-audit.json)

The CLI server experiments use a digest-pinned disposable PostGIS 3.5.2 / PROJ
7.2.1 image. S8 and installed-grid comparisons have networking disabled and no
host ports. S6 publishes only a random loopback database port and uses synthetic
data behind a loopback HTTP proxy. The runners remove only their own containers.
Existing application databases are not modified.

## Hosted Supabase deployment check — 5 November 2026

The read-only MCP connection to `kykbgwewulzceunbbsfa` reports PostgreSQL 17.11,
PostGIS 3.3.7 in the `extensions` schema and PROJ 9.7.1.
`transaction_read_only = on`. All 17 tested database SRIDs declare matching EPSG
authorities. Queries qualify spatial functions with `extensions` because the
connection's default search path contains only the user schema and `public`.

Of the 40 planned browser/server comparisons, 38 ran: all 32 same-datum
projection/inverse cases passed their existing tolerances, with a maximum
projected residual of approximately 5.3e-9 metres and maximum geographic
residual of 3.8e-13 degrees. Six automatic datum comparisons were characterised;
the largest browser/server difference was approximately 1.55 projected metres.
Those datum differences are measurements, not projection-test failures or claims
of ground/survey accuracy. Automatic operation selection was not introspected.

Two explicit-pipeline cases are unsupported because `ST_TransformPipeline` is
not installed on this deployment. Their exact operations were not replaced with
automatic transformations.

To probe named grids without that function, separate tests used the available
`ST_Transform(geometry, from_proj, to_proj)` overload with explicit geographic
GRS80 definitions. Both Australian named-grid operations failed at Sydney with
SQLSTATE `XX000`, PROJ error 4098, "No inverse operation". The
otherwise-matching `+nadgrids=null` control succeeded. This shows that the two
explicit named-grid operations are not usable through the tested path; it does
not establish whether the files are physically installed. The pipeline and grid
limitations must remain visible in persistence/accuracy capability reporting.

The full inputs, server outputs, browser residuals, versions, CRS authorities
and grid definitions are retained in the hosted target JSON report. No
application rows were read and no hosted schema/data changes were made. The
disposable PostGIS oracle is the accepted local/self-hosted development
reference; certification of another deployment is deferred until selected.

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
npm run spike:audit -w @cii/maps
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

## Closeout, capability gates and verification

S1–S8 are accepted for Phase 0 feasibility with the fixture limits stated above.
Their negative findings constrain future implementation: Leaflet 2 remains
non-production; non-Mercator OpenLayers picking needs further work; GeoPackage
routing stays conservative; adapter C stays restricted; and precision workflows
need a verified server operation. These are Phase 1/3/4 implementation
boundaries rather than unresolved foundation decisions.

`inspectPostgisTarget()` discovers the extension schema and inspects actual
function availability in a read-only query adapter. The target audit qualifies
all PostGIS calls and checks CRS authorities before comparing numeric results.
Unsupported exact-pipeline cases are recorded without substitution. Named-grid
probes use labelled explicit definitions on older targets and keep physical
installation unknown on error. `assertTargetTransformation()` throws
`TARGET_CAPABILITY_UNSUPPORTED` for unavailable pipeline/grid requirements,
including an attempted substitution of the successful null-grid control. This is
availability preflight, not certification of coverage, epochs or arbitrary
pipeline correctness; Phase 3 persistence must wire it into operation planning.

The new real-database regression creates PostGIS in a quoted non-public schema
in a fresh disposable database. All 40 comparisons run, including both explicit
pipelines; 32 same-datum cases pass and eight datum comparisons are measured. No
target rows are read, and every audit transaction is read-only. This test is
included in the blocking `maps-accuracy` CI job and the manual spike workflow.

Hosted CI evidence for committed baseline
`dfb5e6af286e349e5d3757abc8405afa2192214b`:

- [Verify](https://github.com/AlanKeown/cii-design-system/actions/runs/41980300653):
  `verify`, `maps-accuracy` and `database` passed, including the live portal
  database tests.
- [Leaflet compatibility](https://github.com/AlanKeown/cii-design-system/actions/runs/41980300481):
  `leaflet-stable` passed; the non-blocking pinned prerelease failed as recorded
  above; the weekly development job was skipped for the push event.

The final closeout diff is verified locally and remains uncommitted. Its added
CI step has not run on GitHub. No commit, push or hosted database modification
is part of this closeout. Local verification passed formatting, Markdown lint,
TypeScript checks, production builds and workflow validation. The full suite
passed 205 unit tests and 69 browser tests, with two existing token-test TODOs
and the opt-in SQLite benchmark skipped in the normal suite. That benchmark
passed separately at all four file sizes across all three readers; its worker
dependency is prebundled to prevent a late Vite reload during measurement. The
disposable target audit, 40-case accuracy suite, installed-grid, vertex
reconstruction and pygeoapi experiments also passed their stated checks.

Phase 1 continues with raster basemaps/layer controls and the remaining
display/source/adapter lifecycle work. Separate self-hosted certification is
required only when a deployment is selected; precision certification remains
outside these feasibility results.
