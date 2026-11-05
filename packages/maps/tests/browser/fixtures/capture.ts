import LeafletEngine from '../../../src/leaflet.ts';
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import OLMap from 'ol/Map.js';
import OLView from 'ol/View.js';
import 'leaflet/dist/leaflet.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import 'ol/ol.css';
import { polygonProbe } from '../../../spikes/polygon-capture.ts';
import {
  createCrsRegistry,
  createTransformService
} from '../../../src/index.ts';
import type { ChangeSet, Coord, MapPointerEvent } from '../../../src/index.ts';

declare global {
  interface Window {
    captureSpike?: {
      changes(): readonly ChangeSet[];
      events(): readonly string[];
      zoom(): number;
      destroy(): void;
    };
  }
}
const container = document.getElementById('map')!;
const engine = new URLSearchParams(location.search).get('engine')!;
const vertices: Coord[] = [
  [-40, 40],
  [40, 40],
  [0, -40]
];
const changes: ChangeSet[] = [],
  events: string[] = [];
const mode = polygonProbe(vertices, (geometry) =>
  changes.push({
    target: { schema: 'spike', table: 'sites' },
    clientRequestId: 'capture-parity',
    returnCrs: 'EPSG:3857',
    inserts: [
      {
        opId: 'one',
        tempId: 'new',
        geometryCrs: 'EPSG:3857',
        geometry,
        properties: {},
        vertexSources: [...vertices, vertices[0]].map((coordinate) => ({
          kind: 'snapped',
          layer: 'snap',
          crs: 'EPSG:3857',
          coordinate
        }))
      }
    ],
    updates: [],
    deletes: []
  })
).create({ crs: 'EPSG:3857' });
const registry = createCrsRegistry();
const transform = await createTransformService(registry).prepare({
  source: 'OGC:CRS84',
  target: 'EPSG:3857'
});
const cleanups: (() => void)[] = [];
const pointer = (event: MapPointerEvent) => {
  events.push(`${event.type}:${event.pointerType}`);
  mode.pointer(event);
};
let pixelToCoord: (pixel: Coord) => Coord;
let zoom: () => number;
if (engine === 'leaflet') {
  const map = new LeafletEngine();
  await map.mount(container, {
    displayCrs: await registry.resolve('EPSG:3857'),
    view: { center: [0, 0], resolution: 1 }
  });
  cleanups.push(
    map.interaction.suspend(['dragPan', 'dblClickZoom', 'boxZoom', 'keyboard']),
    map.interaction.onPointer(pointer),
    map.interaction.onKey((event) => {
      mode.key(event);
    }),
    () => map.destroy()
  );
  pixelToCoord = (pixel) => map.pixelToCoord(pixel);
  zoom = () => map.getView().zoom!;
} else {
  if (engine === 'maplibre') {
    setWorkerUrl(workerUrl);
    const map = new MapLibreMap({
      container,
      center: [0, 0],
      zoom: Math.log2((2 * Math.PI * 6378137) / 512),
      attributionControl: false,
      interactive: false,
      style: { version: 8, sources: {}, layers: [] }
    });
    await map.once('load');
    pixelToCoord = (pixel) => {
      const point = map.unproject([pixel[0], pixel[1]]);
      return transform.coordinate([point.lng, point.lat]);
    };
    zoom = () => map.getZoom();
    cleanups.push(() => map.remove());
  } else {
    const map = new OLMap({
      target: container,
      controls: [],
      interactions: [],
      view: new OLView({ center: [0, 0], resolution: 1 })
    });
    await new Promise<void>((resolve) =>
      map.once('rendercomplete', () => resolve())
    );
    pixelToCoord = (pixel) => {
      const point = map.getCoordinateFromPixel([...pixel])!;
      return [point[0], point[1]];
    };
    zoom = () => map.getView().getZoom()!;
    cleanups.push(() => {
      map.setTarget(undefined);
      map.dispose();
    });
  }
  for (const type of [
    'pointerdown',
    'pointermove',
    'pointerup',
    'click',
    'dblclick'
  ] as const) {
    const listener = (event: MouseEvent) => {
      const box = container.getBoundingClientRect(),
        pixel: Coord = [event.clientX - box.left, event.clientY - box.top];
      const pointerType =
        event instanceof PointerEvent ? event.pointerType : 'mouse';
      pointer({
        type:
          type === 'pointerdown'
            ? 'down'
            : type === 'pointermove'
              ? 'move'
              : type === 'pointerup'
                ? 'up'
                : type,
        pixel,
        coord: pixelToCoord(pixel),
        buttons: event.buttons,
        pointerType:
          pointerType === 'touch'
            ? 'touch'
            : pointerType === 'pen'
              ? 'pen'
              : 'mouse',
        modifiers: {
          alt: event.altKey,
          ctrl: event.ctrlKey,
          meta: event.metaKey,
          shift: event.shiftKey
        },
        preventDefault: () => event.preventDefault()
      });
    };
    container.addEventListener(type, listener);
    cleanups.push(() => container.removeEventListener(type, listener));
  }
  const key = (event: KeyboardEvent) => {
    mode.key(event);
  };
  container.addEventListener('keydown', key);
  cleanups.push(() => container.removeEventListener('keydown', key));
}
window.captureSpike = {
  changes: () => changes,
  events: () => events,
  zoom,
  destroy: () => {
    for (const cleanup of cleanups) cleanup();
  }
};
