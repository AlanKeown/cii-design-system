import Map from 'ol/Map.js';
import View from 'ol/View.js';
import Projection from 'ol/proj/Projection.js';
import { addProjection, addCoordinateTransforms } from 'ol/proj.js';
import VectorTileSource from 'ol/source/VectorTile.js';
import VectorTileLayer from 'ol/layer/VectorTile.js';
import TileGrid from 'ol/tilegrid/TileGrid.js';
import MVT from 'ol/format/MVT.js';
import Style from 'ol/style/Style.js';
import CircleStyle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import 'ol/ol.css';
import {
  createCrsRegistry,
  createTransformService
} from '../../../src/index.ts';
import reference from '../../fixtures/postgis-accuracy.json' with { type: 'json' };

declare global {
  interface Window {
    openlayersCrsSpike?: {
      hits(): number;
      rendered(): boolean;
      center(): number[];
      destroy(): void;
    };
  }
}
const registry = createCrsRegistry(),
  transforms = createTransformService(registry);
const sample = reference.fixtures.find(
  (item) =>
    item.source === 'EPSG:7844' &&
    item.target === 'EPSG:7856' &&
    item.input[0] === 151.21
)!;
const display =
  new URLSearchParams(location.search).get('display') ?? 'EPSG:7856';
for (const code of ['EPSG:7855', 'EPSG:7856'])
  addProjection(
    new Projection({
      code,
      units: 'm',
      extent: [0, 0, 10_000_000, 10_000_000],
      global: false
    })
  );
const forward = await transforms.prepare({
  source: 'EPSG:7856',
  target: 'EPSG:7855',
  datumPolicy: 'require-same-datum'
});
const inverse = await transforms.prepare({
  source: 'EPSG:7855',
  target: 'EPSG:7856',
  datumPolicy: 'require-same-datum'
});
addCoordinateTransforms(
  'EPSG:7856',
  'EPSG:7855',
  (value) => [...forward.coordinate([value[0], value[1]])],
  (value) => [...inverse.coordinate([value[0], value[1]])]
);
const center =
  display === 'EPSG:7856'
    ? sample.expected
    : forward.coordinate([sample.expected[0], sample.expected[1]]);
const source = new VectorTileSource({
  projection: 'EPSG:7856',
  tileGrid: new TileGrid({
    origin: [0, 10_000_000],
    extent: [0, 0, 10_000_000, 10_000_000],
    tileSize: 256,
    resolutions: Array.from(
      { length: 19 },
      (_, zoom) => 10_000_000 / 256 / 2 ** zoom
    )
  }),
  format: new MVT(),
  url: '/spike-mvt/{z}/{x}/{y}.pbf',
  wrapX: false
});
const map = new Map({
  target: 'map',
  controls: [],
  layers: [
    new VectorTileLayer({
      source,
      style: new Style({
        image: new CircleStyle({
          radius: 5,
          fill: new Fill({ color: '#00a000' })
        })
      })
    })
  ],
  view: new View({ projection: display, center: [...center], resolution: 0.15 })
});
await new Promise<void>((resolve) =>
  map.once('rendercomplete', () => resolve())
);
window.openlayersCrsSpike = {
  hits: () => map.getFeaturesAtPixel([384, 256], { hitTolerance: 1 }).length,
  rendered() {
    const viewport = map.getViewport()!.getBoundingClientRect();
    return [...map.getViewport()!.querySelectorAll('canvas')].some((canvas) => {
      const bounds = canvas.getBoundingClientRect();
      const x = Math.round(
        ((viewport.left + 384 - bounds.left) * canvas.width) / bounds.width
      );
      const y = Math.round(
        ((viewport.top + 256 - bounds.top) * canvas.height) / bounds.height
      );
      const pixel = canvas.getContext('2d')!.getImageData(x, y, 1, 1).data;
      return pixel[1] > 100 && pixel[0] < 50 && pixel[2] < 50 && pixel[3] > 200;
    });
  },
  center: () => map.getView().getCenter()!,
  destroy: () => {
    map.setTarget(undefined);
    map.dispose();
  }
};
