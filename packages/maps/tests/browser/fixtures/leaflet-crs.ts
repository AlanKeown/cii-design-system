import 'leaflet/dist/leaflet.css';
import { loadLeaflet } from '../../../src/engine/leaflet-api.ts';
import { createProjectedLeafletCrs } from '../../../src/engine/leaflet-crs.ts';
import {
  createCrsRegistry,
  createTransformService,
  zoomToResolution
} from '../../../src/index.ts';
import reference from '../../fixtures/postgis-accuracy.json' with { type: 'json' };
import type { Coords } from 'leaflet';

export interface LeafletCrsResult {
  zoom: number;
  tileResidualPx: number;
  featureResidualPx: number;
  roundTripMetres: number;
  scaleMetres: number;
  scaleWidthPx: number;
  groundToGridRatio: number;
  tileCount: number;
}
declare global {
  interface Window {
    leafletCrsSpike?: {
      measure(zoom: number): LeafletCrsResult;
      destroy(): void;
    };
  }
}
const L = await loadLeaflet();
const registry = createCrsRegistry();
const definition = structuredClone(await registry.resolve('EPSG:7856'));
definition.tileMatrix = {
  origin: [0, 10_000_000],
  resolutions: Array.from(
    { length: 19 },
    (_, zoom) => 10_000_000 / 256 / 2 ** zoom
  )
};
const transforms = createTransformService(registry);
const crs = createProjectedLeafletCrs(
  L,
  definition,
  await transforms.prepare({
    source: 'EPSG:7844',
    target: definition.code,
    datumPolicy: 'require-same-datum'
  }),
  await transforms.prepare({
    source: definition.code,
    target: 'EPSG:7844',
    datumPolicy: 'require-same-datum'
  })
);
const sample = reference.fixtures.find(
  (item) =>
    item.source === 'EPSG:7844' &&
    item.target === 'EPSG:7856' &&
    item.input[0] === 151.21
)!;
const point = new L.LatLng(sample.input[1], sample.input[0]);
const expected = new L.Point(sample.expected[0], sample.expected[1]);
const map = new L.Map('map', {
  crs,
  zoomControl: false,
  attributionControl: false,
  zoomAnimation: false,
  fadeAnimation: false,
  inertia: false,
  zoomSnap: 0,
  maxZoom: 18
});
map.setView(point, 18);
// Real tiled canvas layer: each crosshair is positioned from the PostGIS oracle, not the browser transform.
class Tiles extends L.GridLayer {
  createTile(coords: Coords) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d')!;
    const resolution = zoomToResolution(coords.z, definition.tileMatrix!);
    const x = expected.x / resolution - coords.x * 256;
    const y = (10_000_000 - expected.y) / resolution - coords.y * 256;
    context.fillStyle = '#eef4fa';
    context.fillRect(0, 0, 256, 256);
    context.strokeStyle = '#d00000';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x - 10, y);
    context.lineTo(x + 10, y);
    context.moveTo(x, y - 10);
    context.lineTo(x, y + 10);
    context.stroke();
    return canvas;
  }
}
new Tiles({ tileSize: 256, maxZoom: 18 }).addTo(map);
const feature = new L.CircleMarker(point, {
  radius: 5,
  color: '#0000d0',
  fillOpacity: 0
}).addTo(map);
window.leafletCrsSpike = {
  measure(zoom) {
    map.setZoom(zoom, { animate: false });
    const resolution = zoomToResolution(zoom, definition.tileMatrix!);
    const projected = crs.project(point);
    const tilePixel = new L.Point(
      expected.x / resolution,
      (10_000_000 - expected.y) / resolution
    );
    const featurePixel = map.project(feature.getLatLng(), zoom);
    const ground = crs.distance(
      map.containerPointToLatLng([334, 256]),
      map.containerPointToLatLng([434, 256])
    );
    const magnitude = 10 ** Math.floor(Math.log10(ground));
    const scaleMetres =
      [5, 2, 1].find((value) => value * magnitude <= ground)! * magnitude;
    const scaleWidthPx = (scaleMetres / ground) * 100;
    const scale = document.getElementById('scale')!;
    scale.textContent = `${scaleMetres} m`;
    scale.style.width = `${scaleWidthPx}px`;
    const roundTrip = crs.project(crs.unproject(expected));
    return {
      zoom,
      tileResidualPx: projected.distanceTo(expected) / resolution,
      featureResidualPx: featurePixel.distanceTo(tilePixel),
      roundTripMetres: roundTrip.distanceTo(expected),
      scaleMetres,
      scaleWidthPx,
      groundToGridRatio: ground / (resolution * 100),
      tileCount: document.querySelectorAll('.leaflet-tile').length
    };
  },
  destroy: () => map.remove()
};
