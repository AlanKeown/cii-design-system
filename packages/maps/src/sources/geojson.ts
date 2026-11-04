import { MapError } from '../errors.ts';
import type {
  FeatureBatch,
  Geometry,
  MapFeature,
  Position
} from '../engine/types.ts';
import type {
  SourceProvider,
  SourceInput,
  ProbeContext
} from '../crs/resolve.ts';
import type { ConfirmedCrs, CrsHint } from '../crs/types.ts';
import type { ResolvedSource } from '../layers/types.ts';
import { Registry } from '../registry.ts';

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const invalid = () =>
  new MapError('SOURCE_INVALID', {
    reason: 'Expected valid simple-feature GeoJSON.'
  });

export function parseGeoJson(
  input: unknown,
  axisOrder: 'xy' | 'yx' = 'xy'
): FeatureBatch {
  let vertices = 0;
  const array = <T>(
    value: unknown,
    visit: (item: unknown) => T,
    minimum = 0
  ): T[] => {
    if (!Array.isArray(value) || value.length < minimum) throw invalid();
    return Array.from(value, visit);
  };
  const position = (value: unknown): Position => {
    if (
      !Array.isArray(value) ||
      value.length < 2 ||
      !Array.from(value).every(
        (item) => typeof item === 'number' && Number.isFinite(item)
      )
    )
      throw invalid();
    if (++vertices > 100_000) throw new MapError('SOURCE_TOO_LARGE');
    return axisOrder === 'yx'
      ? [value[1], value[0], ...value.slice(2)]
      : [value[0], value[1], ...value.slice(2)];
  };
  const ring = (value: unknown): Position[] => {
    const points = array(value, position, 4);
    if (JSON.stringify(points[0]) !== JSON.stringify(points.at(-1)))
      throw invalid();
    return points;
  };
  const geometry = (value: unknown, depth = 0): Geometry => {
    if (!record(value) || depth > 32) throw invalid();
    switch (value.type) {
      case 'Point':
        return { type: value.type, coordinates: position(value.coordinates) };
      case 'MultiPoint':
        return {
          type: value.type,
          coordinates: array(value.coordinates, position)
        };
      case 'LineString':
        return {
          type: value.type,
          coordinates: array(value.coordinates, position, 2)
        };
      case 'MultiLineString':
        return {
          type: value.type,
          coordinates: array(value.coordinates, (line) =>
            array(line, position, 2)
          )
        };
      case 'Polygon':
        return {
          type: value.type,
          coordinates: array(value.coordinates, ring)
        };
      case 'MultiPolygon':
        return {
          type: value.type,
          coordinates: array(value.coordinates, (polygon) =>
            array(polygon, ring)
          )
        };
      case 'GeometryCollection':
        return {
          type: value.type,
          geometries: array(value.geometries, (child) =>
            geometry(child, depth + 1)
          )
        };
      default:
        throw invalid();
    }
  };
  const feature = (value: unknown): MapFeature => {
    if (
      !record(value) ||
      value.type !== 'Feature' ||
      (value.properties !== null && !record(value.properties))
    )
      throw invalid();
    if (
      value.id !== undefined &&
      typeof value.id !== 'string' &&
      !(typeof value.id === 'number' && Number.isFinite(value.id))
    )
      throw invalid();
    return {
      type: 'Feature',
      ...(value.id !== undefined ? { id: value.id } : {}),
      properties: value.properties ?? {},
      geometry: value.geometry === null ? null : geometry(value.geometry)
    };
  };
  if (!record(input)) throw invalid();
  if (input.type === 'FeatureCollection') {
    if (!Array.isArray(input.features)) throw invalid();
    if (input.features.length > 10_000) throw new MapError('SOURCE_TOO_LARGE');
    return {
      type: 'FeatureCollection',
      features: array(input.features, feature)
    };
  }
  return {
    type: 'FeatureCollection',
    features: [
      input.type === 'Feature'
        ? feature(input)
        : { type: 'Feature', properties: {}, geometry: geometry(input) }
    ]
  };
}

async function readResponse(response: Response): Promise<unknown> {
  if (!response.ok || !response.body)
    throw new MapError('SOURCE_LOAD_FAILED', { status: response.status });
  const limit = 5 * 1024 * 1024;
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body.cancel();
    throw new MapError('SOURCE_TOO_LARGE');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new MapError('SOURCE_TOO_LARGE');
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch (error) {
    if (error instanceof MapError) throw error;
    throw invalid();
  } finally {
    reader.releaseLock();
  }
}

export interface FeatureSourceProvider extends SourceProvider {
  open(
    source: SourceInput,
    crs: ConfirmedCrs,
    context: { signal?: AbortSignal }
  ): Promise<ResolvedSource>;
}

/** Per-map provider instances: probes and opens share a request, without a global cache. */
export function createFeatureSources(
  fetcher: typeof fetch = (...args) => globalThis.fetch(...args)
): Registry<FeatureSourceProvider> {
  const registry = new Registry<FeatureSourceProvider>();
  for (const provider of ['inline', 'geojson']) {
    const cache = new WeakMap<
      SourceInput,
      Promise<{ data: FeatureBatch; hint?: CrsHint }>
    >();
    const read = (source: SourceInput, signal?: AbortSignal) => {
      let pending = cache.get(source);
      if (!pending) {
        pending = (async () => {
          let raw: unknown;
          if (provider === 'inline') {
            if (!('data' in source)) throw invalid();
            raw = source.data;
          } else {
            if (
              !('url' in source) ||
              typeof source.url !== 'string' ||
              /^(?!https?:)[a-z][\w+.-]*:/i.test(source.url)
            )
              throw invalid();
            raw = await readResponse(await fetcher(source.url, { signal }));
          }
          const data = parseGeoJson(raw);
          let hint: CrsHint | undefined =
            provider === 'geojson'
              ? { code: 'OGC:CRS84', from: 'rfc7946_default' }
              : undefined;
          if (record(raw) && raw.crs !== undefined) {
            if (
              !record(raw.crs) ||
              !record(raw.crs.properties) ||
              typeof raw.crs.properties.name !== 'string'
            )
              throw invalid();
            const name = raw.crs.properties.name;
            const epsg = name.match(/(?:EPSG:|EPSG::|EPSG\/0\/)(\d+)$/i);
            hint = {
              code: epsg ? `EPSG:${epsg[1]}` : name,
              from: 'geojson_crs'
            };
          }
          return { data, hint };
        })();
        cache.set(source, pending);
      }
      return pending;
    };
    registry.register(provider, {
      crsMode: 'declared',
      probe: async (source, context: ProbeContext) => ({
        kind: 'hint',
        hint: (await read(source, context.signal)).hint
      }),
      open: async (source, crs, context) => ({
        provider,
        crs,
        identity:
          provider === 'geojson' && 'url' in source
            ? String(source.url)
            : 'inline',
        renderKind: 'features',
        data: parseGeoJson(
          (await read(source, context.signal)).data,
          crs.crs.axisOrder
        ),
        spatial: { type: 'features' },
        remote: provider === 'geojson'
      })
    });
  }
  return registry;
}
