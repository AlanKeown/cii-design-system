import proj4 from 'proj4';
import type { Converter } from 'proj4';
import { MapError } from '../errors.ts';
import type { FeatureBatch, Geometry, Position } from '../engine/types.ts';
import { isConfirmedCrs } from './confirmation.ts';
import type { CrsRegistry } from './registry.ts';
import type { ConfirmedCrs, Coord, CrsDef } from './types.ts';
import type {
  PreparedTransform,
  TransformAccuracy,
  TransformRequest,
  TransformWarning
} from './transform-types.ts';

function validateDefinition(definition: CrsDef, code: string): void {
  if (
    definition.code !== code ||
    typeof definition.proj4 !== 'string' ||
    !definition.proj4.trimStart().startsWith('+') ||
    !/\+proj=[^+\s]+/.test(definition.proj4) ||
    /\+proj=(?:geocent|pipeline)(?:\s|\+|$)/.test(definition.proj4)
  ) {
    throw new MapError('TRANSFORM_DEFINITION_INVALID', {
      code,
      reason:
        'Registry must supply an explicit horizontal PROJ definition for this code.'
    });
  }
  const datum = definition.datum;
  if (
    datum &&
    (typeof datum.id !== 'string' ||
      !datum.id.trim() ||
      typeof datum.name !== 'string' ||
      !datum.name.trim() ||
      !['static', 'dynamic', 'ensemble'].includes(datum.kind) ||
      (datum.referenceEpoch !== undefined &&
        !Number.isFinite(datum.referenceEpoch)))
  ) {
    throw new MapError('TRANSFORM_DEFINITION_INVALID', {
      code,
      reason: 'Invalid geodetic datum metadata.'
    });
  }
  for (const match of definition.proj4.matchAll(
    /\+(?:nadgrids|geoidgrids)=([^+\s]*)/g
  )) {
    if (match[1].split(',').some((grid) => grid.replace(/^@/, '') !== 'null')) {
      // No implicit optional-grid fallback or reliance on another app's global proj4 grids.
      throw new MapError('TRANSFORM_GRID_UNSUPPORTED', {
        code,
        reason:
          'Named grids require a vetted grid integration; this display service supports no grid files yet.'
      });
    }
  }
}

function describe(
  source: CrsDef,
  target: CrsDef,
  request: TransformRequest
): TransformAccuracy {
  const relationship =
    source.datum && target.datum
      ? source.datum.id === target.datum.id
        ? 'same'
        : 'different'
      : 'unknown';
  const warnings: TransformWarning[] = [];
  if (relationship === 'different')
    warnings.push({
      code: 'DATUM_DIFFERENCE',
      message:
        'Source and target datums differ. No datum-operation accuracy is validated for this browser transform; use the authoritative PostGIS pipeline for precision.'
    });
  if (relationship === 'unknown')
    warnings.push({
      code: 'DATUM_UNKNOWN',
      message:
        'Datum metadata is missing. Matching ellipsoids or projection strings do not establish datum equivalence.'
    });
  if (source.datum?.kind === 'ensemble' || target.datum?.kind === 'ensemble')
    warnings.push({
      code: 'DATUM_ENSEMBLE',
      message:
        'A datum ensemble does not identify a single realisation. Its definition alone cannot establish survey-accuracy alignment.'
    });
  if (
    request.sourceEpoch !== undefined ||
    request.targetEpoch !== undefined ||
    source.datum?.kind === 'dynamic' ||
    target.datum?.kind === 'dynamic'
  )
    warnings.push({
      code: 'EPOCH_NOT_APPLIED',
      message:
        'Coordinate epochs are recorded only. This horizontal display service does not apply time-dependent transformations or plate-motion models.'
    });
  return {
    tier: 'display',
    authoritative: false,
    dimensions: 'horizontal-only',
    operation:
      request.source === request.target
        ? 'identity'
        : relationship === 'same'
          ? 'projection'
          : 'definition-transform',
    source: {
      code: source.code,
      ...(request.sourceEpoch !== undefined
        ? { epoch: request.sourceEpoch }
        : {}),
      ...(source.datum ? { datum: source.datum } : {})
    },
    target: {
      code: target.code,
      ...(request.targetEpoch !== undefined
        ? { epoch: request.targetEpoch }
        : {}),
      ...(target.datum ? { datum: target.datum } : {})
    },
    datumRelationship: relationship,
    horizontalAccuracyMetres: null,
    warnings
  };
}

/** Browser/display tier only. PostGIS retains responsibility for authoritative transforms. */
export class TransformService {
  readonly registry: CrsRegistry;

  constructor(registry: CrsRegistry) {
    this.registry = registry;
  }

  /** Resolve/compile once, then reuse synchronously over coordinates, geometry or batches. */
  async prepare(input: TransformRequest): Promise<PreparedTransform> {
    const request = { ...input };
    if (
      typeof request.source !== 'string' ||
      !request.source.trim() ||
      typeof request.target !== 'string' ||
      !request.target.trim() ||
      [request.sourceEpoch, request.targetEpoch].some(
        (epoch) =>
          epoch !== undefined &&
          (typeof epoch !== 'number' || !Number.isFinite(epoch))
      ) ||
      (request.datumPolicy !== undefined &&
        !['allow-display', 'require-same-datum'].includes(request.datumPolicy))
    ) {
      throw new MapError('TRANSFORM_REQUEST_INVALID', {
        reason: 'Source and target codes are explicit; epochs must be finite.'
      });
    }
    // Definitions come only from this registry. Never register aliases in proj4's global defs.
    const source = structuredClone(await this.registry.resolve(request.source));
    const target =
      request.target === request.source
        ? source
        : structuredClone(await this.registry.resolve(request.target));
    validateDefinition(source, request.source);
    validateDefinition(target, request.target);
    const accuracy = describe(source, target, request);
    if (
      request.datumPolicy === 'require-same-datum' &&
      accuracy.datumRelationship !== 'same'
    ) {
      throw new MapError('TRANSFORM_DATUM_POLICY', {
        source: source.code,
        target: target.code,
        relationship: accuracy.datumRelationship
      });
    }
    let converter: Converter;
    try {
      converter = proj4(source.proj4, target.proj4);
    } catch {
      throw new MapError('TRANSFORM_DEFINITION_INVALID', {
        source: source.code,
        target: target.code
      });
    }
    const invalidCoordinate = () =>
      new MapError('TRANSFORM_COORDINATE_INVALID', {
        source: source.code,
        target: target.code
      });
    const coordinate = (value: Coord): Coord => {
      if (
        !Array.isArray(value) ||
        value.length !== 2 ||
        !Array.from(value).every(
          (ordinate) =>
            typeof ordinate === 'number' && Number.isFinite(ordinate)
        ) ||
        (!source.projected && Math.abs(value[1]) > 90)
      )
        throw invalidCoordinate();
      let output: number[];
      try {
        // enforceAxis defaults to false: core x/y is already normalised at the provider boundary.
        output =
          request.source === request.target
            ? [value[0], value[1]]
            : converter.forward([value[0], value[1]]);
      } catch {
        throw new MapError('TRANSFORM_FAILED', {
          source: source.code,
          target: target.code
        });
      }
      if (
        !output ||
        output.length !== 2 ||
        !output.every(Number.isFinite) ||
        (!target.projected && Math.abs(output[1]) > 90)
      )
        throw new MapError('TRANSFORM_FAILED', {
          source: source.code,
          target: target.code
        });
      return [output[0], output[1]];
    };
    const position = (value: Position): Position => {
      if (
        !Array.isArray(value) ||
        value.length < 2 ||
        !Array.from(value).every(
          (ordinate) =>
            typeof ordinate === 'number' && Number.isFinite(ordinate)
        )
      )
        throw invalidCoordinate();
      const xy = coordinate([value[0], value[1]]);
      return [xy[0], xy[1], ...value.slice(2)];
    };
    const mapArray = <T, U>(
      values: readonly T[],
      visit: (value: T) => U
    ): U[] => {
      if (!Array.isArray(values))
        throw new MapError('TRANSFORM_GEOMETRY_INVALID');
      return Array.from(values, visit);
    };
    const geometry = (value: Geometry, depth = 0): Geometry => {
      if (!value || depth > 128)
        throw new MapError('TRANSFORM_GEOMETRY_INVALID');
      try {
        switch (value.type) {
          case 'Point':
            return {
              type: value.type,
              coordinates: position(value.coordinates)
            };
          case 'MultiPoint':
          case 'LineString':
            return {
              type: value.type,
              coordinates: mapArray(value.coordinates, position)
            };
          case 'MultiLineString':
          case 'Polygon':
            return {
              type: value.type,
              coordinates: mapArray(value.coordinates, (line) =>
                mapArray(line, position)
              )
            };
          case 'MultiPolygon':
            return {
              type: value.type,
              coordinates: mapArray(value.coordinates, (polygon) =>
                mapArray(polygon, (line) => mapArray(line, position))
              )
            };
          case 'GeometryCollection':
            return {
              type: value.type,
              geometries: mapArray(value.geometries, (child) =>
                geometry(child, depth + 1)
              )
            };
          default:
            throw new MapError('TRANSFORM_GEOMETRY_INVALID');
        }
      } catch (error) {
        if (error instanceof MapError) throw error;
        throw new MapError('TRANSFORM_GEOMETRY_INVALID');
      }
    };
    const features = (batch: FeatureBatch): FeatureBatch => {
      if (
        !batch ||
        batch.type !== 'FeatureCollection' ||
        !Array.isArray(batch.features)
      )
        throw new MapError('TRANSFORM_GEOMETRY_INVALID');
      return {
        type: 'FeatureCollection',
        features: mapArray(batch.features, (feature) => {
          if (!feature || feature.type !== 'Feature')
            throw new MapError('TRANSFORM_GEOMETRY_INVALID');
          return {
            type: 'Feature',
            ...(feature.id !== undefined ? { id: feature.id } : {}),
            properties: feature.properties,
            geometry:
              feature.geometry === null ? null : geometry(feature.geometry)
          };
        })
      };
    };
    return {
      get accuracy() {
        return structuredClone(accuracy);
      },
      coordinate,
      position,
      geometry,
      features
    };
  }

  /** The caller supplies source coordinates already normalised to core x/y. */
  async forDisplay(
    source: ConfirmedCrs,
    displayCrs: string,
    options: Pick<TransformRequest, 'targetEpoch' | 'datumPolicy'> = {}
  ): Promise<PreparedTransform> {
    if (!isConfirmedCrs(source)) throw new MapError('CRS_NOT_CONFIRMED');
    return this.prepare({
      source: source.crs.code,
      target: displayCrs,
      sourceEpoch: source.crs.epoch,
      targetEpoch: options.targetEpoch,
      datumPolicy: options.datumPolicy
    });
  }
}

export function createTransformService(
  registry: CrsRegistry
): TransformService {
  return new TransformService(registry);
}
