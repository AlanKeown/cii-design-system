import { MapError } from './errors.ts';
import { resolveViewResolution, resolutionToZoom } from './view.ts';
import type { EngineView, ViewState } from './view.ts';
import type { Coord, Extent, TileMatrix } from './crs/types.ts';

/** Deterministic view-only fake; no DOM, rendering, or geographic transform claims. */
export class FakeViewEngine implements EngineView {
  #center: Coord = [0, 0];
  #resolution = 1;
  readonly width: number;
  readonly height: number;
  readonly matrix?: TileMatrix;

  constructor(
    options: { width?: number; height?: number; matrix?: TileMatrix } = {}
  ) {
    this.width = options.width ?? 800;
    this.height = options.height ?? 600;
    this.matrix = options.matrix;
    if (
      ![this.width, this.height].every(
        (value) => Number.isFinite(value) && value > 0
      )
    )
      throw new MapError('VIEW_INVALID', options);
  }

  getView(): ViewState {
    const [x, y] = this.#center;
    const dx = (this.width * this.#resolution) / 2;
    const dy = (this.height * this.#resolution) / 2;
    return {
      center: [...this.#center],
      resolution: this.#resolution,
      rotation: 0,
      zoom: this.matrix
        ? resolutionToZoom(this.#resolution, this.matrix)
        : undefined,
      extent: [x - dx, y - dy, x + dx, y + dy]
    };
  }

  setView(view: Partial<ViewState>): void {
    if (view.rotation !== undefined && view.rotation !== 0)
      throw new MapError('VIEW_INVALID', {
        reason: 'Fake view does not support rotation.'
      });
    if (view.center && !view.center.every(Number.isFinite))
      throw new MapError('VIEW_INVALID', { center: view.center });
    const resolution =
      view.resolution !== undefined || view.zoom !== undefined
        ? resolveViewResolution(view, this.matrix)
        : this.#resolution;
    if (view.center) this.#center = [...view.center];
    this.#resolution = resolution;
  }

  fitExtent(
    extent: Extent,
    options: { padding?: number; maxZoom?: number } = {}
  ): void {
    const [minX, minY, maxX, maxY] = extent;
    const padding = options.padding ?? 0;
    const width = this.width - 2 * padding;
    const height = this.height - 2 * padding;
    if (
      !extent.every(Number.isFinite) ||
      maxX <= minX ||
      maxY <= minY ||
      !Number.isFinite(padding) ||
      padding < 0 ||
      width <= 0 ||
      height <= 0
    )
      throw new MapError('VIEW_INVALID', { extent, padding });
    let resolution = Math.max((maxX - minX) / width, (maxY - minY) / height);
    if (options.maxZoom !== undefined) {
      resolution = Math.max(
        resolution,
        resolveViewResolution({ zoom: options.maxZoom }, this.matrix)
      );
    }
    this.setView({
      center: [(minX + maxX) / 2, (minY + maxY) / 2],
      resolution
    });
  }

  pixelToCoord([x, y]: Coord): Coord {
    return [
      this.#center[0] + (x - this.width / 2) * this.#resolution,
      this.#center[1] - (y - this.height / 2) * this.#resolution
    ];
  }

  coordToPixel([x, y]: Coord): Coord {
    return [
      this.width / 2 + (x - this.#center[0]) / this.#resolution,
      this.height / 2 - (y - this.#center[1]) / this.#resolution
    ];
  }

  resolutionAt(_coord: Coord): number {
    return this.#resolution;
  }
}

/** Reusable checks that real browser adapters can run with their own assertion library. */
export function checkViewConformance(
  engine: EngineView,
  tolerance = 1e-8
): string[] {
  const failures: string[] = [];
  const near = (actual: number, expected: number, label: string) => {
    if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance)
      failures.push(label);
  };
  engine.setView({ center: [1500, -2500], resolution: 4, rotation: 0 });
  const view = engine.getView();
  near(view.center[0], 1500, 'view center x');
  near(view.center[1], -2500, 'view center y');
  near(view.resolution, 4, 'view resolution');
  near(engine.resolutionAt(view.center), 4, 'resolution at center');
  const pixel: Coord = [123, 234];
  const roundTrip = engine.coordToPixel(engine.pixelToCoord(pixel));
  near(roundTrip[0], pixel[0], 'pixel round-trip x');
  near(roundTrip[1], pixel[1], 'pixel round-trip y');
  engine.fitExtent([0, 0, 100, 100]);
  const fitted = engine.getView();
  near(fitted.center[0], 50, 'fit center x');
  near(fitted.center[1], 50, 'fit center y');
  if (
    fitted.extent[0] > tolerance ||
    fitted.extent[1] > tolerance ||
    fitted.extent[2] < 100 - tolerance ||
    fitted.extent[3] < 100 - tolerance
  )
    failures.push('fit extent containment');
  return failures;
}
