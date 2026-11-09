# Mapping Phase 1 acceptance review

Review date: **9 November 2026**. Result: **Phase 1 remains open**.

The display implementation is present on Leaflet, OpenLayers and MapLibre. This
review checks the supported Phase 1 source types and display paths against
[the development plan](./svelte-mapping-components-development-plan.md). The
remaining contract issue is R1.6: configuration intentionally stores CRS
declarations, whereas the criterion asks for the resolved confirmation and its
provenance to be serialised in that configuration. Passing browser tests does
not resolve that conflict or establish WCAG certification.

## Scope

- Read-only inline/GeoJSON features, XYZ tiles, WMS and WMTS.
- `MapContainer`, declarative `Layer`, `CrsConfirm`, zoom, layer list,
  attribution, scale and coordinate controls.
- Leaflet native displays and configured metre grids, including MGA zone 56;
  OpenLayers registered horizontal CRSs, including MGA; MapLibre EPSG:3857.
- Chromium browser automation, deterministic synthetic services and the
  checked-in PostGIS projection reference. No live basemap or survey alignment
  certification is inferred.

Other source formats, legend/identify, selection and editing are later-phase
features. Their acceptance criteria are not counted as implemented here.

## R1: source CRS confirmation

| Criterion                                                   | Result                       | Evidence                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1.1: reject unconfirmed sources before engine work         | Pass for supported sources   | `packages/maps/tests/layers.test.ts` rejects missing/incomplete confirmations. `tests/browser/layers.spec.ts` checks an actionable child error without an engine registration. The manager is shared across adapters.                                                                                                  |
| R1.2: service metadata and provenance                       | Pass for WMS/WMTS            | `tests/ogc-raster.test.ts` and `tests/crs.test.ts` verify advertised candidates, document/element provenance and rejection of manual service declarations. Native raster rendering runs on all adapters in `tests/browser/adapters.spec.ts`.                                                                           |
| R1.3: declaration required; embedded hints do not confirm   | Pass for inline/GeoJSON/XYZ  | `tests/crs.test.ts`, `tests/crs-confirmation.test.ts` and `tests/browser/crs-confirm.spec.ts` check missing declarations, mismatch acknowledgement, source-scoped evidence and changed-hint invalidation. Later file/database formats are outside Phase 1.                                                             |
| R1.4: explicit multi-CRS policy                             | Pass                         | `tests/crs.test.ts` and `tests/crs-confirmation.test.ts` exercise `prefer-native` and `prefer-display`, retaining the selected record.                                                                                                                                                                                 |
| R1.5: axis order retained and applied correctly             | Pass for supported protocols | `tests/ogc-raster.test.ts`, `tests/browser/ogc-raster.spec.ts` and display-switch tests cover WMS versions, EPSG:4326/CRS84 axes and WMTS grid interpretation. Core uses x/y after the source boundary.                                                                                                                |
| R1.6: runtime inspection and serialisation in configuration | Partial; open contract issue | `MapController.snapshot().layers[].crs` and `ManagedLayer.spec.source.crs` expose the confirmed record and provenance as JSON-compatible data. `MapConfig` accepts declarations/policies, not the resolved `ConfirmedCrs`. Plan §12.5 expressly excludes `confirmedAt` from config and resolves sources again on load. |

Test paths without a package prefix in this document are relative to
`packages/maps/`.

Do not fix R1.6 by trusting a saved timestamp or bypassing source confirmation.
The next implementation should define a versioned, serialisable companion
snapshot containing the input config plus inspection-only resolved provenance.
Restoration must revalidate declarations and re-probe service metadata. Update
R1.6 and §12.5 together to describe that distinction, and add round-trip and
changed-metadata tests. This is follow-up work, not a shipped export API.

## R2: display CRS

| Criterion                                | Result                          | Evidence and limit                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R2.1: EPSG:3857 default                  | Pass                            | `tests/config.test.ts` and `tests/browser/phase-one.spec.ts` verify omitted display settings.                                                                                                                                                                                                                                                                                                                                     |
| R2.2: explicit capabilities; no fallback | Pass for supported definitions  | Registry/config tests and `tests/browser/phase-one.spec.ts` reject unknown CRSs without changing the live view. `tests/browser/adapters.spec.ts` checks registered but unsupported targets and missing Leaflet grids. Custom MapLibre projections remain unsupported even with experimental opt-in.                                                                                                                               |
| R2.3: per-layer compatibility            | Pass                            | `tests/layers.test.ts` checks fixed grids, service CRSs, renderer support and experimental gates. `tests/browser/adapters.spec.ts` verifies native raster paths; `tests/browser/layers.spec.ts` checks hidden child grids, blocked switches and OpenLayers reprojection.                                                                                                                                                          |
| R2.4: atomic runtime switches            | Pass for supported target pairs | Unit and browser `display-switch` tests cover preserved identity/settings/provenance, latest-request wins, failures, late cleanup and retained edit-target blockers. `tests/browser/adapters.spec.ts` verifies MGA round trips on Leaflet/OpenLayers; declarative child ownership is covered separately. MapLibre has one supported production display and refuses other targets. Actual captured geometries remain Phase 3 work. |

## Phase 1 accessibility and lifecycle

| Plan item                                               | Result                                  | Evidence and remaining limits                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §15.4.1: landmark, name and description                 | Automated pass                          | `tests/browser/phase-one.spec.ts` checks region/canvas names, caller description association and shortcut help on all three engines.                                                                                                                                                                                                         |
| §15.4.2: keyboard pan, zoom, rotation and escape by Tab | Automated pass                          | `tests/browser/keyboard.spec.ts` verifies Shift+arrows, user events, suspension, interception and Tab to controls. Ordinary pan/zoom and native pixel conformance are covered in adapter tests.                                                                                                                                              |
| §15.4.3: native controls, names, focus and targets      | Automated pass after correction         | `tests/browser/phase-one.spec.ts` checks the visible Phase 1 controls, 24×24 minimum dimensions, focus order and the actual focus-ring token. Layer-list inputs, CRS mismatch acknowledgement and disclosure summaries now have explicit minimum target sizes; `tests/browser/crs-confirm.spec.ts` also measures the acknowledgement target. |
| §15.4.5: colour/contrast                                | Automated pass for default empty canvas | `tests/browser/phase-one.spec.ts` reads native outline colours on all engines in both themes and verifies 3:1 against `--cii-map-surface`. Token unit tests also check contrast. Arbitrary raster basemaps, custom colours and reduced opacity require consuming-app checks. Legend/selection criteria apply when those features ship.       |
| §15.4.6: reduced motion                                 | Automated pass after correction         | `tests/browser/phase-one.spec.ts` requests animated API changes under reduced motion and verifies immediate views and no drag inertia. A two-finger OpenLayers rotation checks the release snap has no animation. PinchRotate now uses duration zero, like other first-party OL navigation defaults.                                         |
| §15.3: repeated teardown and cancellation               | Automated pass for DOM/readiness        | Five native mount/destroy cycles per engine and cancellation during lazy loading leave no map DOM or late readiness callbacks. Existing tests cover source cancellation and late prepared-resource disposal. These checks do not measure retained heap or certify GPU-resource counts.                                                       |

Manual screen-reader checks, physical touch/keyboard devices, Firefox/Safari and
consuming-app alternatives/contrasts have not been established by this review.
Descriptions and adjacent site lists exist in documentation examples; the later
feature-list/legend work is not substituted with a claim of full accessibility.

## Corrections made during this review

1. Give layer-list inputs, the CRS mismatch acknowledgement and map disclosure
   summaries 24-pixel minimum targets.
2. Replace OpenLayers' default animated pinch-rotation release with the
   first-party adapter's zero-duration interaction.
3. Add a named/associated description to the shared acceptance fixture and
   cross-engine tests for target/focus, motion, contrast, CRS refusal and native
   lifecycle behaviour.

## Validation and release boundary

The review is checked by `npm run check`, `npm run build`, `npm test`, Markdown
lint and formatting checks. The acceptance cases live in
`packages/maps/tests/browser/phase-one.spec.ts`; the existing protocol,
confirmation, switching, declarative-layer and keyboard suites remain part of
`npm test`. Selected-feature token contrast and distinction are enforced in both
themes; selection interactions themselves remain later-phase work.

The documentation collection includes this review and builds it under
`/design/mapping-phase-1-review/`. A local build does not establish that this
revision has been published. No deployment, commit or push is performed by this
review. Phase 2 should follow resolution of R1.6 and the remaining acceptance
sign-off, rather than silently treating Phase 1 as closed.
