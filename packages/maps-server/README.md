# @cii/maps-server

Server-side metadata and target-capability foundations for the
[mapping development plan](../../docs/svelte-mapping-components-development-plan.md).

`probeGeometryColumn()` converts an authorised database metadata result into the
probe contract used by `@cii/maps`. An undefined SRID (`0`) requires a
declaration. For a known SRID, callers must supply its authority from
`spatial_ref_sys`; a local database SRID is never assumed to be an EPSG
identifier.

```ts
import { probeGeometryColumn } from '@cii/maps-server';

const probe = probeGeometryColumn({
  schema: 'assets',
  table: 'parcels',
  column: 'geom',
  srid: 7856,
  authority: { name: 'EPSG', code: 7856 }
});
```

`inspectPostgisTarget(query, srids)` inspects extension/system metadata through
an application-supplied query adapter. The adapter returns the single JSON value
produced by each SELECT and must use read-only transactions. Inspection rejects
non-read-only metadata, discovers the actual PostGIS schema, quotes its
identifier, records CRS authorities and checks function availability without
inferring support from the version number.

`probeAustralianGrid()` tests an explicitly named Australian grid at Sydney.
Older servers use a separately labelled definition-based probe; no exact
pipeline comparison is silently replaced. Failed operations leave physical grid
installation unknown. A successful null-grid control is never evidence that the
named grid works.

```ts
import {
  inspectPostgisTarget,
  probeAustralianGrid,
  assertTargetTransformation,
  type AuditQuery
} from '@cii/maps-server';

async function requireGridOperation(query: AuditQuery): Promise<void> {
  const target = await inspectPostgisTarget(query, [4283, 7844]);
  const grid = 'au_icsm_GDA94_GDA2020_conformal.tif';
  const probe = await probeAustralianGrid(query, target, grid);
  assertTargetTransformation(target, [probe], { kind: 'named-grid', grid });
}
```

Availability preflight throws `TARGET_CAPABILITY_UNSUPPORTED` when the required
pipeline/grid operation is unavailable. Automatic transforms cannot satisfy a
precision operation's explicit requirements. These helpers do not certify survey
accuracy, operation selection, geographic coverage or epochs, authorise writes,
or implement persistence. Phase 3 adapters must enforce their required
operations before preparing writes and retain server validation/transactions.

The package owns no database connections or credentials and exposes no routes or
write endpoints. Application adapters supply authorised queries; the only
runtime dependency is `@cii/maps`. The CLI
`npm run audit:target -w @cii/maps -- /tmp/audit.json` uses an existing libpq
service profile. The local `npm run spike:audit -w @cii/maps` checks a
non-public extension schema in a fresh disposable PostGIS database without
touching hosted application data.

Build the core first (`npm run build:packages` builds both in order). Run
`npm run check -w @cii/maps-server` and `npm run test:unit -w @cii/maps-server`
for local validation. CI picks these up through the repository's workspace
commands.
