---
title: Map
description: A first Leaflet feature map with explicit CRS confirmation and display accuracy reporting.
---

<script lang="ts">
  import MapExample from '#lib/examples/MapExample.svelte';
</script>

`@cii/maps/svelte` provides an SSR-safe `MapContainer`. This first slice displays inline and fetched GeoJSON features using Leaflet 1.9.4, first-party zoom controls and mandatory attribution.

<MapExample />

## Usage

```svelte
<script lang="ts">
  import '@cii/tokens/tokens.css';
  import { MapContainer } from '@cii/maps/svelte';
  import type { MapConfig } from '@cii/maps';

  const config: MapConfig = {
    engine: 'leaflet',
    view: { center: { crs: 'OGC:CRS84', coordinates: [151.21, -33.87] }, zoom: 14 },
    layers: [{
      id: 'sites',
      source: {
        provider: 'geojson', url: '/data/sites.geojson',
        crs: { code: 'OGC:CRS84', provenance: { kind: 'declared', by: 'application author' } }
      },
      attribution: 'Your data attribution'
    }]
  };
</script>

<MapContainer {config} label="Community sites" description="Community locations, also available in the adjacent list." />
```

Install the `leaflet` peer (`>=1.9.4 <2`) and the package's `proj4` peer. Leaflet code loads in the browser during mounting; its CSS is included by the Svelte entry point. Always provide a meaningful `label` and a non-map alternative for information in the map.

## CRS and accuracy

Every input source requires a declaration. A GeoJSON file's RFC 7946 CRS is a suggestion; it cannot confirm the source by itself. Inline sources can explicitly tag projected or geographic coordinates. Display defaults to EPSG:3857. Leaflet features are transformed from original coordinates into the display CRS's geographic base, and source coordinates remain available unchanged.

The first adapter supports EPSG:3857, EPSG:4326 and CRS84 display. A display CRS without a registered tile matrix uses explicit `view.resolution` rather than zoom. Other display CRSs fail without fallback. GDA94/GDA2020 inputs can be shown on Web Mercator, with a visible datum warning; this does not certify survey alignment.

## Lifecycle and updates

Changing data, visibility, opacity, order or base style updates the existing map. Network requests are cancelled when superseded or unmounted, and pending engine loads cannot call `onready` after teardown. The canvas resizes with its container. `view` is bindable; view changes are also available through `onviewchange`. Use `onready` to access the typed engine contract and `onerror` for typed errors.

Engine/display changes require an explicit component remount in this slice; runtime CRS switch orchestration remains pending. The initial `runtime` prop can inject app-owned registries or a fetch implementation through `createLeafletRuntime`, exported from `@cii/maps/svelte`. Credentials belong in that runtime fetch implementation, not in serialised map config.

## Accessibility and scope

The canvas becomes tabbable after it is ready. Arrow keys pan and +/− zoom. Zoom controls have accessible names and visible focus styles; Tab leaves the map normally. Reduced-motion settings disable inertia and animated view requests. Attribution is always present and remote data attribution is rendered as text.

This slice supports base path styling, circle points and theme tokens. Labels, icons, data-driven rules, raster basemaps, custom projected displays and editing are not implemented yet; unsupported options fail explicitly. GeoJSON reads are bounded to 5 MiB, 10,000 features and 100,000 positions. Properties are treated as data and never inserted as HTML.
