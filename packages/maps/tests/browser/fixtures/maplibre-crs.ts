import {
  Map,
  addProjection,
  importScriptInWorkers,
  removeProjection,
  setWorkerUrl
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import {
  createCrsRegistry,
  createTransformService
} from '../../../src/index.ts';

setWorkerUrl(workerUrl);

export interface MapLibreCrsResult {
  layer: string;
  x: number;
  y: number;
  count: number;
}
declare global {
  interface Window {
    maplibreCrsSpike?: {
      measure(layer: string): Promise<MapLibreCrsResult>;
      destroy(): void;
    };
  }
}
const registry = createCrsRegistry();
const definition = await registry.resolve('EPSG:7856');
const transforms = createTransformService(registry);
const forward = await transforms.prepare({
  source: 'EPSG:7844',
  target: definition.code,
  datumPolicy: 'require-same-datum'
});
const inverse = await transforms.prepare({
  source: definition.code,
  target: 'EPSG:7844',
  datumPolicy: 'require-same-datum'
});
await importScriptInWorkers(
  new URL('/generated/projection-worker.js', location.href).href
);
addProjection({
  name: definition.code,
  definition: definition.proj4,
  projection: {
    forward: (coordinate) => [
      ...forward.coordinate([coordinate[0], coordinate[1]])
    ],
    inverse: (coordinate) => [
      ...inverse.coordinate([coordinate[0], coordinate[1]])
    ]
  },
  tileMatrixSet: { origin: [0, 10_000_000], extentAtZoom0: 10_000_000 }
});
const center = forward.coordinate([151.21, -33.87]);
const ring = [
  [-2, -2],
  [2, -2],
  [2, 2],
  [-2, 2],
  [-2, -2]
].map(([x, y]) => [...inverse.coordinate([center[0] + x, center[1] + y])]);
const map = new Map({
  container: 'map',
  center: [151.21, -33.87],
  zoom: 17,
  maxZoom: 17,
  attributionControl: false,
  canvasContextAttributes: { preserveDrawingBuffer: true },
  fadeDuration: 0,
  style: {
    version: 8,
    projection: { type: definition.code },
    sources: {
      tiles: {
        type: 'raster',
        tiles: [`${location.origin}/spike-tiles/{z}/{x}/{y}.png`],
        tileSize: 256,
        maxzoom: 18
      },
      wms: {
        type: 'raster',
        tiles: [
          `${location.origin}/spike-wms?service=WMS&request=GetMap&version=1.3.0&crs=EPSG:7856&width=256&height=256&bbox={bbox}`
        ],
        tileSize: 256,
        maxzoom: 18
      },
      sketch: {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: { type: 'Point', coordinates: [151.21, -33.87] }
            },
            {
              type: 'Feature',
              properties: {},
              geometry: { type: 'Polygon', coordinates: [ring] }
            }
          ]
        }
      }
    },
    layers: [
      {
        id: 'tiles',
        type: 'raster',
        source: 'tiles',
        paint: { 'raster-fade-duration': 0, 'raster-resampling': 'nearest' }
      },
      {
        id: 'wms',
        type: 'raster',
        source: 'wms',
        paint: { 'raster-fade-duration': 0, 'raster-resampling': 'nearest' }
      },
      {
        id: 'sketch',
        type: 'circle',
        source: 'sketch',
        paint: { 'circle-radius': 5, 'circle-color': '#00ff00' }
      },
      {
        id: 'sketch-outline',
        type: 'line',
        source: 'sketch',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'line-color': '#00ff00', 'line-width': 2 }
      }
    ]
  }
});
await map.once('idle');
window.maplibreCrsSpike = {
  async measure(layer) {
    for (const id of ['tiles', 'wms', 'sketch', 'sketch-outline'])
      map.setLayoutProperty(
        id,
        'visibility',
        id === layer || (layer === 'sketch' && id === 'sketch-outline')
          ? 'visible'
          : 'none'
      );
    await map.once('idle');
    const canvas = map.getCanvas();
    const gl = canvas.getContext('webgl2')!;
    const size = 48,
      left = canvas.width / 2 - size / 2,
      bottom = canvas.height / 2 - size / 2;
    const pixels = new Uint8Array(size * size * 4);
    gl.readPixels(left, bottom, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let x = 0,
      y = 0,
      count = 0;
    const channel = layer === 'tiles' ? 0 : layer === 'wms' ? 2 : 1;
    for (let row = 0; row < size; row++)
      for (let col = 0; col < size; col++) {
        const offset = (row * size + col) * 4;
        if (
          pixels[offset + channel] > 200 &&
          pixels[offset + ((channel + 1) % 3)] < 60 &&
          pixels[offset + ((channel + 2) % 3)] < 60
        ) {
          x += left + col + 0.5;
          y += canvas.height - bottom - row - 0.5;
          count++;
        }
      }
    return { layer, x: x / count, y: y / count, count };
  },
  destroy() {
    map.remove();
    removeProjection(definition.code);
  }
};
