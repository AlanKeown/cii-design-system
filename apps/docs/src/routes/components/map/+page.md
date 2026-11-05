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
      style: { stroke: { color: 'token:--cii-text-info' }, fill: { color: 'token:--cii-text-info' } },
      attribution: 'Your data attribution'
    }]
  };
</script>

<MapContainer {config} label="Community sites" description="Community locations, also available in the adjacent list." />
```

Install the `leaflet` peer (`>=1.9.4 <2`) and the package's `proj4` peer. Leaflet code loads in the browser during mounting; its CSS is included by the Svelte entry point. Always provide a meaningful `label` and a non-map alternative for information in the map.

## Properties

| Property | Type | Default |
| --- | --- | --- |
| `config` | `MapConfig` (required) | — |
| `label` | string (required) | — |
| `description` | string | — |
| `height` | CSS length | `24rem` |
| `view` | `ViewState`, bindable | — |
| `runtime` | `MapRuntime`, read once when mounted | `createLeafletRuntime()` |
| `children` | Svelte snippet | — |
| `onready` | `(engine: IMapEngine) => void` | — |
| `onerror` | `(error: MapError) => void` | — |
| `onviewchange` | `(view: ViewState, source: 'api' \| 'user') => void` | — |

`MapContainer` does not yet accept `class` or forward other attributes to its root element.

## Behaviour and accessibility

The canvas becomes tabbable after it is ready. Arrow keys pan and +/− zoom. Zoom controls have accessible names and visible focus styles; Tab leaves the map normally. Reduced-motion settings disable inertia and animated view requests. Attribution is always present and remote data attribution is rendered as text.

Changing data, visibility, opacity, order or base style updates the existing map. Network requests are cancelled when superseded or unmounted, and pending engine loads cannot call `onready` after teardown. The canvas resizes with its container. `view` is bindable; view changes are also available through `onviewchange`. Use `onready` to access the typed engine contract and `onerror` for typed errors.

Engine/display changes require an explicit component remount in this slice; runtime CRS switch orchestration remains pending. The initial `runtime` prop can inject app-owned registries or a fetch implementation through `createLeafletRuntime`, exported from `@cii/maps/svelte`. Credentials belong in that runtime fetch implementation, not in serialised map config.

## CRS and accuracy

Every input source requires a declaration. A GeoJSON file's RFC 7946 CRS is a suggestion; it cannot confirm the source by itself. Inline sources can explicitly tag projected or geographic coordinates. Display defaults to EPSG:3857. Leaflet features are transformed from original coordinates into the display CRS's geographic base, and source coordinates remain available unchanged.

The first adapter supports EPSG:3857, EPSG:4326 and CRS84 display. A display CRS without a registered tile matrix uses explicit `view.resolution` rather than zoom. Other display CRSs fail without fallback. GDA94/GDA2020 inputs can be shown on Web Mercator, with a visible datum warning; this does not certify survey alignment.

## Content

Make `label` name what the map shows, such as "Community sites"; the canvas is announced as that label followed by "map canvas". Use `description` for the purpose of the map and where its text alternative is. It is shown above the map and linked to it with `aria-describedby`. Put every fact a user needs from the map in that alternative, such as a list or [data table](/components/data-table/), because features on the canvas are not exposed to assistive technology.

Write attribution as the provider's required credit in plain text. When the map cannot load or update, it shows a danger [Alert](/components/alert/) headed "Map could not be updated", followed by the error code and a technical reason. Use `onerror` to explain the problem and the next step in the language of the task.

## Themes and responsive layout

The map surface, border, controls and alerts use semantic tokens and follow `data-cii-theme`. `token:` colours in layer styles are resolved again when the theme changes, without remounting the map.

Without a style, features use `--cii-brand-primary`. In the dark theme that colour measures 1.29:1 against the map background, below the 3:1 needed for meaningful graphics, so set stroke and fill colours explicitly. `token:--cii-text-info` measures 5.95:1 in the light theme and 6.30:1 in the dark theme. Do not rely on colour alone to distinguish layers.

The map fills the width of its container and resizes with it. `height` sets the viewport height, with a minimum of 12rem. On small screens, choose a height that leaves the text alternative and surrounding content easy to reach. Attribution wraps within the container.

## Scope and limits

This slice supports base path styling, circle points and theme tokens. Labels, icons, data-driven rules, raster basemaps, custom projected displays and editing are not implemented yet; unsupported options fail explicitly. GeoJSON reads are bounded to 5 MiB, 10,000 features and 100,000 positions. Properties are treated as data and never inserted as HTML.
