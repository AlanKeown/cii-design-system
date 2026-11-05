# @cii/maps-server

Initial server-side metadata foundation for the
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

This package does not connect to PostGIS, execute SQL, expose endpoints, or
persist edits yet. Application adapters remain responsible for authorising and
querying metadata. The only runtime dependency is the local `@cii/maps` package.

Build the core first (`npm run build:packages` builds both in order). Run
`npm run check -w @cii/maps-server` and `npm run test:unit -w @cii/maps-server`
for local validation. CI picks these up through the repository's workspace
commands.
