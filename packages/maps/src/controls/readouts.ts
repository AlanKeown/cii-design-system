import { MapError } from '../errors.ts';
import type { Coord, CrsDef } from '../crs/types.ts';
import type {
  PreparedTransform,
  TransformAccuracy
} from '../crs/transform-types.ts';
import type { IMapEngine } from '../engine/types.ts';

const radius = 6378137;
const radians = Math.PI / 180;
export interface ScaleValue {
  metres: number;
  width: number;
  label: string;
}
export interface CoordinateValue {
  mode: 'pointer' | 'centre';
  displayCode: string;
  displayText: string;
  readoutCode: string;
  readoutText: string;
  accuracy: TransformAccuracy;
}
export interface ReadoutSnapshot {
  scaleEnabled: boolean;
  coordinatesEnabled: boolean;
  scale: ScaleValue | null;
  coordinates: CoordinateValue | null;
  scaleError: MapError | null;
  coordinateError: MapError | null;
}

/** Local spherical ground approximation; values are display aids, not survey measurements. */
export function groundMetresPerPixel(
  definition: CrsDef,
  resolution: number,
  centre: Coord,
  geographic: PreparedTransform
): number {
  if (!Number.isFinite(resolution) || resolution <= 0)
    throw new MapError('VIEW_INVALID');
  const location = geographic.coordinate(centre);
  const latitude = location[1];
  if (!Number.isFinite(latitude) || Math.abs(latitude) >= 90)
    throw new MapError('TRANSFORM_COORDINATE_INVALID');
  if (definition.code === 'EPSG:3857')
    return resolution * Math.cos(latitude * radians);
  if (definition.units === 'degrees')
    return resolution * radius * radians * Math.cos(latitude * radians);
  // Other registered projections: sample a short eastward displacement to avoid
  // assuming projected metres are ground metres. The distance remains spherical.
  const step = Math.min(1, resolution);
  const other = geographic.coordinate([centre[0] + step, centre[1]]);
  const dLat = (other[1] - latitude) * radians;
  const dLon = (other[0] - location[0]) * radians;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(latitude * radians) *
      Math.cos(other[1] * radians) *
      Math.sin(dLon / 2) ** 2;
  const distance =
    2 * radius * Math.asin(Math.sqrt(Math.max(0, Math.min(1, a))));
  const result = (distance / step) * resolution;
  if (!Number.isFinite(result) || result <= 0)
    throw new MapError('TRANSFORM_COORDINATE_INVALID');
  return result;
}

/** Pick a readable 1/2/5 distance that fits the available CSS pixels. */
export function scaleValue(
  metresPerPixel: number,
  maxWidth: number
): ScaleValue | null {
  if (
    !Number.isFinite(metresPerPixel) ||
    metresPerPixel <= 0 ||
    !Number.isFinite(maxWidth) ||
    maxWidth <= 0
  )
    return null;
  const maximum = metresPerPixel * maxWidth;
  if (!Number.isFinite(maximum) || maximum <= 0) return null;
  const magnitude = 10 ** Math.floor(Math.log10(maximum));
  const coefficient = maximum / magnitude;
  const metres = (coefficient >= 5 ? 5 : coefficient >= 2 ? 2 : 1) * magnitude;
  if (!Number.isFinite(metres) || metres <= 0) return null;
  const amount = metres >= 1000 ? metres / 1000 : metres;
  const decimals = Math.min(12, Math.max(0, -Math.floor(Math.log10(amount))));
  return {
    metres,
    width: Math.min(maxWidth, metres / metresPerPixel),
    label: `${amount.toFixed(decimals)} ${metres >= 1000 ? 'km' : 'm'}`
  };
}

export function coordinateText(coordinate: Coord, definition: CrsDef): string {
  if (!coordinate.every(Number.isFinite))
    throw new MapError('TRANSFORM_COORDINATE_INVALID');
  const digits = definition.units === 'degrees' ? 6 : 2;
  const number = (input: number) => {
    const rounded = input.toFixed(digits);
    return Number(rounded) === 0 ? (0).toFixed(digits) : rounded;
  };
  return definition.units === 'degrees'
    ? `Longitude ${number(coordinate[0])}°, latitude ${number(coordinate[1])}°`
    : `X ${number(coordinate[0])} m, Y ${number(coordinate[1])} m`;
}

export interface ReadoutOptions {
  display: CrsDef;
  target: CrsDef;
  geographic?: PreparedTransform;
  transform?: PreparedTransform;
  scale: boolean;
  coordinates: boolean;
  width: () => number;
  /** Browser default; tests can provide a deterministic frame scheduler. */
  schedule?: (callback: () => void) => () => void;
  onerror?: (error: MapError) => void;
}

/** Engine-contract subscriptions only: no native engine APIs or external control plugins. */
export class ReadoutObserver {
  #engine: IMapEngine;
  #options: ReadoutOptions;
  #emit: (snapshot: ReadoutSnapshot) => void;
  #pixel: Coord | null = null;
  #off: (() => void)[] = [];
  #cancel?: () => void;
  #closed = false;
  #errors = new Map<string, string>();
  constructor(
    engine: IMapEngine,
    options: ReadoutOptions,
    emit: (snapshot: ReadoutSnapshot) => void
  ) {
    this.#engine = engine;
    this.#options = options;
    this.#emit = emit;
    this.#off.push(
      engine.on('viewchange', () => this.#queue()),
      engine.on('resize', () => this.#queue()),
      engine.on('destroy', () => this.destroy())
    );
    if (options.coordinates)
      this.#off.push(
        engine.interaction.onPointer((event) => {
          if (!['move', 'down', 'click'].includes(event.type)) return;
          this.#pixel = [...event.pixel];
          this.#queue();
        }),
        engine.interaction.onKey(() => this.useCentre())
      );
    this.refresh();
  }
  #queue(): void {
    if (this.#closed || this.#cancel) return;
    const schedule =
      this.#options.schedule ??
      ((callback: () => void) => {
        const id = requestAnimationFrame(callback);
        return () => cancelAnimationFrame(id);
      });
    this.#cancel = schedule(() => {
      this.#cancel = undefined;
      if (!this.#closed) this.refresh();
    });
  }
  useCentre(): void {
    if (!this.#closed) {
      this.#pixel = null;
      this.#queue();
    }
  }
  #failure(control: string, cause: unknown): MapError {
    const error =
      cause instanceof MapError
        ? new MapError(cause.code, { ...cause.details, control })
        : new MapError('TRANSFORM_COORDINATE_INVALID', { control });
    if (this.#errors.get(control) !== error.code) {
      this.#errors.set(control, error.code);
      this.#options.onerror?.(error);
    }
    return error;
  }
  refresh(): void {
    if (this.#closed) return;
    const options = this.#options;
    const snapshot: ReadoutSnapshot = {
      scaleEnabled: options.scale,
      coordinatesEnabled: options.coordinates,
      scale: null,
      coordinates: null,
      scaleError: null,
      coordinateError: null
    };
    if (options.scale) {
      try {
        const centre = this.#engine.getView().center;
        const width = Math.min(120, Math.max(0, options.width() - 48));
        snapshot.scale = scaleValue(
          groundMetresPerPixel(
            options.display,
            this.#engine.resolutionAt(centre),
            centre,
            options.geographic!
          ),
          width
        );
        this.#errors.delete('scale');
      } catch (cause) {
        snapshot.scaleError = this.#failure('scale', cause);
      }
    }
    if (options.coordinates) {
      try {
        const display = this.#pixel
          ? this.#engine.pixelToCoord(this.#pixel)
          : this.#engine.getView().center;
        const transformed = options.transform!.coordinate(display);
        snapshot.coordinates = {
          mode: this.#pixel ? 'pointer' : 'centre',
          displayCode: options.display.code,
          displayText: coordinateText(display, options.display),
          readoutCode: options.target.code,
          readoutText: coordinateText(transformed, options.target),
          accuracy: options.transform!.accuracy
        };
        this.#errors.delete('coords');
      } catch (cause) {
        snapshot.coordinateError = this.#failure('coords', cause);
      }
    }
    this.#emit(snapshot);
  }
  destroy(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#cancel?.();
    this.#cancel = undefined;
    for (const off of this.#off.splice(0)) off();
  }
}
