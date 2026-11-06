import { toCoreCoord } from './resolve.ts';
import type { SourceCoordinatePreview } from './resolve.ts';
import type { Coord, CrsRef } from './types.ts';
import type { MapConfig } from '../config/types.ts';
import type { MapRuntime } from '../map-controller.ts';

/** A synthetic envelope interpretation, never a confirmation of the original source. */
export async function createInterpretationPreview(
  input: SourceCoordinatePreview,
  crs: CrsRef,
  runtime: MapRuntime
): Promise<{ sample: Coord; config: MapConfig }> {
  const lower = toCoreCoord([input.extent[0], input.extent[1]], crs);
  const upper = toCoreCoord([input.extent[2], input.extent[3]], crs);
  const x1 = Math.min(lower[0], upper[0]),
    y1 = Math.min(lower[1], upper[1]);
  const x2 = Math.max(lower[0], upper[0]),
    y2 = Math.max(lower[1], upper[1]);
  const corners: [number, number][] = [
    [x1, y1],
    [x2, y1],
    [x2, y2],
    [x1, y2],
    [x1, y1]
  ];
  const transform = await runtime.transforms.prepare({
    source: crs.code,
    target: 'EPSG:4326'
  });
  const geographic = corners.map((coordinate) =>
    transform.coordinate(coordinate)
  );
  const sample = transform.coordinate(toCoreCoord(input.sample, crs));
  const spanX =
    Math.max(...geographic.map((point) => point[0])) -
    Math.min(...geographic.map((point) => point[0]));
  const spanY =
    Math.max(...geographic.map((point) => point[1])) -
    Math.min(...geographic.map((point) => point[1]));
  return {
    sample,
    config: {
      engine: 'leaflet',
      display: { crs: 'EPSG:4326' },
      view: {
        center: { crs: crs.code, coordinates: [(x1 + x2) / 2, (y1 + y2) / 2] },
        resolution: Math.max(spanX / 300, spanY / 200, 0.0001)
      },
      layers: [
        {
          id: 'source-envelope-preview',
          attribution: 'Unconfirmed CRS interpretation preview',
          source: {
            provider: 'inline',
            crs: {
              code: crs.code,
              provenance: { kind: 'declared', by: 'Synthetic preview author' }
            },
            data: {
              type: 'Feature',
              properties: {},
              geometry:
                x1 === x2 && y1 === y2
                  ? { type: 'Point', coordinates: [x1, y1] }
                  : x1 === x2 || y1 === y2
                    ? {
                        type: 'LineString',
                        coordinates: [
                          [x1, y1],
                          [x2, y2]
                        ]
                      }
                    : { type: 'Polygon', coordinates: [corners] }
            }
          },
          style: {
            stroke: {
              color: 'token:--cii-map-feature',
              width: 2,
              dash: [6, 4]
            },
            fill: { color: 'token:--cii-map-feature', opacity: 0.15 }
          }
        }
      ]
    }
  };
}
