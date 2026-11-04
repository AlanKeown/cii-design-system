import { MapError } from './errors.ts';
import type { Coord, Extent, TileMatrix } from './crs/types.ts';

export interface ViewState {
  center: Coord;
  resolution: number;
  zoom?: number;
  rotation: number;
  extent: Extent;
}

/** Canonical view subset shared by the full IMapEngine contract and view-only tests. */
export interface EngineView {
  getView(): ViewState;
  setView(view: Partial<ViewState>): void;
  fitExtent(
    extent: Extent,
    options?: { padding?: number; maxZoom?: number }
  ): void;
  pixelToCoord(pixel: Coord): Coord;
  coordToPixel(coord: Coord): Coord;
  resolutionAt(coord: Coord): number;
}

function levels(matrix: TileMatrix): readonly number[] {
  const values = matrix.resolutions;
  if (
    values.length < 2 ||
    values.some(
      (value, i) =>
        !Number.isFinite(value) ||
        value <= 0 ||
        (i > 0 && value >= values[i - 1])
    )
  ) {
    throw new MapError('VIEW_INVALID', {
      reason:
        'Resolution table must be positive and strictly descending, with at least two levels.'
    });
  }
  return values;
}

export function zoomToResolution(zoom: number, matrix: TileMatrix): number {
  const values = levels(matrix);
  if (!Number.isFinite(zoom)) throw new MapError('VIEW_INVALID', { zoom });
  const index = Math.max(0, Math.min(values.length - 2, Math.floor(zoom)));
  const resolution =
    values[index] * (values[index + 1] / values[index]) ** (zoom - index);
  if (!Number.isFinite(resolution) || resolution <= 0)
    throw new MapError('VIEW_INVALID', { zoom });
  return resolution;
}

export function resolutionToZoom(
  resolution: number,
  matrix: TileMatrix
): number {
  const values = levels(matrix);
  if (!Number.isFinite(resolution) || resolution <= 0)
    throw new MapError('VIEW_INVALID', { resolution });
  let index = values.findIndex(
    (value, i) => i < values.length - 1 && resolution >= values[i + 1]
  );
  if (index === -1) index = values.length - 2;
  return (
    index +
    Math.log(resolution / values[index]) /
      Math.log(values[index + 1] / values[index])
  );
}

export function resolveViewResolution(
  view: { resolution?: number; zoom?: number },
  matrix?: TileMatrix,
  warn: (message: string) => void = () => {}
): number {
  if (view.resolution !== undefined) {
    if (!Number.isFinite(view.resolution) || view.resolution <= 0)
      throw new MapError('VIEW_INVALID', view);
    if (view.zoom !== undefined && matrix) {
      const derived = zoomToResolution(view.zoom, matrix);
      if (Math.abs(derived - view.resolution) / view.resolution > 0.01)
        warn('Resolution overrides inconsistent zoom.');
    }
    return view.resolution;
  }
  if (view.zoom !== undefined && matrix)
    return zoomToResolution(view.zoom, matrix);
  throw new MapError('VIEW_INVALID', {
    reason: 'Provide resolution, or zoom with a tile matrix.'
  });
}
