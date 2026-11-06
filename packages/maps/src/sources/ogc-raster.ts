import { MapError } from '../errors.ts';
import type { ConfirmedCrs, CrsRef, TileMatrix } from '../crs/types.ts';
import type { ProbeContext, SourceInput, ProbeResult } from '../crs/resolve.ts';
import type { DataSourceProvider } from './geojson.ts';
import type { ResolvedSource } from '../layers/types.ts';
import {
  child,
  children,
  crsCode,
  fetchCapabilities,
  href,
  httpUrl,
  kvpUrl,
  metadataInvalid,
  text,
  value
} from './ogc-metadata.ts';
import type { XmlElement } from './ogc-metadata.ts';

export interface WmsTileData {
  kind: 'wms';
  url: string;
  version: '1.1.1' | '1.3.0';
  layers: string[];
  format: string;
  supportedCrs: string[];
  /** Set by the renderer after checking advertised display support. */
  requestCrs?: string;
  axisOrder?: 'xy' | 'yx';
}
export interface WmtsMatrix {
  id: string;
  scale: number;
  origin: [number, number];
  tileWidth: number;
  tileHeight: number;
  width: number;
  height: number;
  limits?: { minRow: number; maxRow: number; minCol: number; maxCol: number };
  zoom?: number;
}
export interface WmtsTileData {
  kind: 'wmts';
  url: string;
  encoding: 'kvp' | 'rest';
  layer: string;
  matrixSet: string;
  format: string;
  style: string;
  dimensions: Record<string, string>;
  matrices: WmtsMatrix[];
}
export type OgcTileData = WmsTileData | WmtsTileData;
interface WmtsSet {
  id: string;
  code: string;
  matrices: WmtsMatrix[];
  element: string;
}
interface WmtsMetadata {
  kind: 'wmts';
  data: Omit<WmtsTileData, 'matrices' | 'matrixSet'>;
  sets: WmtsSet[];
}
interface WmsMetadata {
  kind: 'wms';
  data: WmsTileData;
  elements: Map<string, string>;
}
type Metadata = { url: string } & (WmsMetadata | WmtsMetadata);

const formats = ['image/png', 'image/jpeg', 'image/webp'];
function format(values: string[]): string {
  const selected = formats.find((candidate) => values.includes(candidate));
  if (!selected)
    throw metadataInvalid('No supported raster image format is advertised.');
  return selected;
}
function option(
  source: SourceInput,
  name: string,
  required = false
): string | undefined {
  const result = name in source ? Reflect.get(source, name) : undefined;
  if (result === undefined && !required) return undefined;
  if (typeof result !== 'string' || !result.trim())
    throw metadataInvalid(`Missing or invalid ${name} option.`);
  return result;
}
function number(node: XmlElement, name: string, integer = false): number {
  const raw = value(node, name);
  const result = Number(raw);
  if (
    !(
      integer ? /^\+?\d+$/ : /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/
    ).test(raw)
  )
    throw metadataInvalid(`Invalid ${name} number syntax.`);
  if (
    !Number.isFinite(result) ||
    (integer && (!Number.isSafeInteger(result) || result < 0))
  )
    throw metadataInvalid(`Invalid ${name} value.`);
  return result;
}
function uniqueIds(
  nodes: XmlElement[],
  name = 'Identifier'
): Map<string, XmlElement> {
  const result = new Map<string, XmlElement>();
  for (const node of nodes) {
    const id = value(node, name);
    if (result.has(id)) throw metadataInvalid(`Duplicate ${name}.`);
    result.set(id, node);
  }
  return result;
}

function parseWms(
  root: XmlElement,
  url: string,
  source: SourceInput
): WmsMetadata {
  const version = root.getAttribute('version');
  if (
    !['WMS_Capabilities', 'WMT_MS_Capabilities'].includes(
      root.localName || ''
    ) ||
    (version !== '1.1.1' && version !== '1.3.0')
  )
    throw metadataInvalid('Expected WMS 1.1.1 or 1.3.0 capabilities.');
  if (option(source, 'version') && option(source, 'version') !== version)
    throw metadataInvalid('WMS version differs from the requested version.');
  const capability = child(root, 'Capability');
  const getMap = child(child(capability, 'Request'), 'GetMap');
  const imageFormat = format(children(getMap, 'Format').map(text));
  const endpoints = children(getMap, 'DCPType')
    .flatMap((dcp) => children(dcp, 'HTTP'))
    .flatMap((http) => children(http, 'Get'))
    .flatMap((get) => children(get, 'OnlineResource'))
    .map(href)
    .filter(Boolean);
  if (!endpoints.length)
    throw metadataInvalid('WMS GetMap has no HTTP GET endpoint.');
  const endpoint = httpUrl(endpoints[0], url);
  const layers = new Map<
    string,
    {
      codes: Map<string, string>;
      restricted: boolean;
      dimensions: Map<string, boolean>;
    }
  >();
  const tag = version === '1.3.0' ? 'CRS' : 'SRS';
  function visit(
    node: XmlElement,
    inherited: Map<string, string>,
    restricted: boolean,
    inheritedDimensions: Map<string, boolean>,
    path: string
  ) {
    const codes = new Map(inherited);
    children(node, tag).forEach((item, index) => {
      for (const code of text(item).split(/\s+/).filter(Boolean))
        codes.set(crsCode(code), `${path}/${tag}[${index + 1}]`);
    });
    restricted =
      restricted ||
      ['fixedWidth', 'fixedHeight'].some(
        (key) => Number(node.getAttribute(key) || '0') !== 0
      ) ||
      ['1', 'true'].includes(node.getAttribute('noSubsets') || '');
    const dimensions = new Map(inheritedDimensions);
    for (const dim of [
      ...children(node, 'Dimension'),
      ...children(node, 'Extent')
    ]) {
      const name = dim.getAttribute('name');
      if (!name) throw metadataInvalid('A WMS dimension has no name.');
      dimensions.set(name, !!dim.getAttribute('default'));
    }
    const names = children(node, 'Name');
    if (names.length > 1)
      throw metadataInvalid('A WMS layer has multiple names.');
    if (names.length) {
      const name = text(names[0]);
      if (!name || layers.has(name))
        throw metadataInvalid('WMS layer names must be nonempty and unique.');
      layers.set(name, { codes, restricted, dimensions });
    }
    children(node, 'Layer').forEach((layer, index) =>
      visit(layer, codes, restricted, dimensions, `${path}/Layer[${index + 1}]`)
    );
  }
  children(capability, 'Layer').forEach((layer, index) =>
    visit(layer, new Map(), false, new Map(), `/Capability/Layer[${index + 1}]`)
  );
  const selected = option(source, 'layers', true)!
    .split(',')
    .map((name) => name.trim());
  if (
    selected.some((name) => !name) ||
    new Set(selected).size !== selected.length
  )
    throw metadataInvalid('WMS layers must be distinct comma-separated names.');
  const records = selected.map((name) => {
    const layer = layers.get(name);
    if (!layer)
      throw metadataInvalid('A requested WMS layer is not advertised.');
    if (
      layer.restricted ||
      [...layer.dimensions.values()].some((hasDefault) => !hasDefault)
    )
      throw metadataInvalid(
        'WMS tiled requests require subsettable layers without fixed dimensions and advertised defaults for service dimensions.'
      );
    return layer;
  });
  const supportedCrs = [...records[0].codes.keys()].filter((code) =>
    records.every((layer) => layer.codes.has(code))
  );
  if (!supportedCrs.length)
    throw metadataInvalid(
      'Requested WMS layers have no common advertised CRS.'
    );
  return {
    kind: 'wms',
    elements: new Map(
      supportedCrs.map((code) => [
        code,
        records.map((record) => record.codes.get(code)).join(', ')
      ])
    ),
    data: {
      kind: 'wms',
      url: endpoint,
      version,
      layers: selected,
      format: imageFormat,
      supportedCrs
    }
  };
}

function parseWmts(
  root: XmlElement,
  url: string,
  source: SourceInput
): WmtsMetadata {
  if (
    root.localName !== 'Capabilities' ||
    root.getAttribute('version') !== '1.0.0'
  )
    throw metadataInvalid('Expected WMTS 1.0.0 capabilities.');
  if (option(source, 'version') && option(source, 'version') !== '1.0.0')
    throw metadataInvalid('Only WMTS 1.0.0 is supported.');
  const contents = child(root, 'Contents');
  const layerId = option(source, 'layer', true)!;
  const layer = uniqueIds(children(contents, 'Layer')).get(layerId);
  if (!layer) throw metadataInvalid('Requested WMTS layer is not advertised.');
  const imageFormat = format(children(layer, 'Format').map(text));
  const styles = uniqueIds(children(layer, 'Style'));
  const defaultStyles = [...styles].filter(([, node]) =>
    ['true', '1'].includes(node.getAttribute('isDefault') || '')
  );
  const style =
    defaultStyles.length === 1
      ? defaultStyles[0][0]
      : styles.size === 1
        ? [...styles.keys()][0]
        : undefined;
  if (!style)
    throw metadataInvalid('WMTS layer needs an unambiguous default style.');
  const dimensions: Record<string, string> = Object.create(null);
  for (const [id, dimension] of uniqueIds(children(layer, 'Dimension'))) {
    if (
      /^(?:service|request|version|layer|style|format|tilematrixset|tilematrix|tilerow|tilecol|__proto__|constructor|prototype)$/i.test(
        id
      )
    )
      throw metadataInvalid('Reserved WMTS dimension name.');
    dimensions[id] = value(dimension, 'Default');
  }
  const resource = children(layer, 'ResourceURL').find(
    (node) =>
      node.getAttribute('resourceType') === 'tile' &&
      node.getAttribute('format') === imageFormat
  );
  let endpoint: string | undefined;
  if (!resource) {
    for (const operation of children(
      child(root, 'OperationsMetadata'),
      'Operation'
    )) {
      if (operation.getAttribute('name') !== 'GetTile') continue;
      for (const get of children(operation, 'DCP')
        .flatMap((dcp) => children(dcp, 'HTTP'))
        .flatMap((http) => children(http, 'Get'))) {
        const encoding = [
          ...children(operation, 'Constraint'),
          ...children(get, 'Constraint')
        ].filter((node) => node.getAttribute('name') === 'GetEncoding');
        if (
          encoding.length &&
          !encoding.some((node) =>
            children(node, 'AllowedValues')
              .flatMap((allowed) => children(allowed, 'Value'))
              .some((val) => text(val) === 'KVP')
          )
        )
          continue;
        if (href(get)) {
          endpoint = httpUrl(href(get), url);
          break;
        }
      }
    }
  }
  if (resource)
    endpoint = httpUrl(resource.getAttribute('template') || '', url)
      .replace(/%7B/gi, '{')
      .replace(/%7D/gi, '}');
  if (!endpoint)
    throw metadataInvalid(
      'WMTS has no usable REST tile template or KVP HTTP GET endpoint.'
    );
  if (resource) {
    const allowed = new Set([
      'style',
      'TileMatrixSet',
      'TileMatrix',
      'TileRow',
      'TileCol',
      'Style',
      ...Object.keys(dimensions)
    ]);
    for (const match of endpoint.matchAll(/\{([^}]+)\}/g))
      if (!allowed.has(match[1]))
        throw metadataInvalid('Unsupported WMTS REST template variable.');
    if (
      !['TileMatrix', 'TileRow', 'TileCol'].every((key) =>
        endpoint!.includes(`{${key}}`)
      )
    )
      throw metadataInvalid('WMTS REST tile coordinates are missing.');
  }
  const definitions = uniqueIds(children(contents, 'TileMatrixSet'));
  const links = uniqueIds(
    children(layer, 'TileMatrixSetLink'),
    'TileMatrixSet'
  );
  const requestedSet = option(source, 'matrixSet');
  if (requestedSet && !links.has(requestedSet))
    throw metadataInvalid(
      'Requested WMTS matrix set is not linked by the layer.'
    );
  const sets: WmtsSet[] = [];
  for (const [id, link] of links) {
    if (requestedSet && id !== requestedSet) continue;
    const definition = definitions.get(id);
    if (!definition)
      throw metadataInvalid('A linked WMTS matrix set is missing.');
    const code = crsCode(value(definition, 'SupportedCRS'));
    const limitsNode = children(link, 'TileMatrixSetLimits');
    if (limitsNode.length > 1) throw metadataInvalid('Duplicate WMTS limits.');
    const limits = limitsNode.length
      ? uniqueIds(children(limitsNode[0], 'TileMatrixLimits'), 'TileMatrix')
      : undefined;
    const matrices: WmtsMatrix[] = [];
    const matrixNodes = uniqueIds(children(definition, 'TileMatrix'));
    if (limits && [...limits.keys()].some((key) => !matrixNodes.has(key)))
      throw metadataInvalid('WMTS limits refer to an unknown matrix.');
    for (const [matrixId, matrix] of matrixNodes) {
      if (limits && !limits.has(matrixId)) continue;
      const origin = value(matrix, 'TopLeftCorner').split(/\s+/).map(Number);
      if (origin.length !== 2 || !origin.every(Number.isFinite))
        throw metadataInvalid('Invalid WMTS top-left origin.');
      const item: WmtsMatrix = {
        id: matrixId,
        scale: number(matrix, 'ScaleDenominator'),
        origin: [origin[0], origin[1]],
        tileWidth: number(matrix, 'TileWidth', true),
        tileHeight: number(matrix, 'TileHeight', true),
        width: number(matrix, 'MatrixWidth', true),
        height: number(matrix, 'MatrixHeight', true)
      };
      if (
        item.scale <= 0 ||
        !item.tileWidth ||
        !item.tileHeight ||
        !item.width ||
        !item.height
      )
        throw metadataInvalid(
          'WMTS scales and matrix dimensions must be positive.'
        );
      const limit = limits?.get(matrixId);
      if (limit) {
        item.limits = {
          minRow: number(limit, 'MinTileRow', true),
          maxRow: number(limit, 'MaxTileRow', true),
          minCol: number(limit, 'MinTileCol', true),
          maxCol: number(limit, 'MaxTileCol', true)
        };
        if (
          item.limits.minRow > item.limits.maxRow ||
          item.limits.minCol > item.limits.maxCol ||
          item.limits.maxRow >= item.height ||
          item.limits.maxCol >= item.width
        )
          throw metadataInvalid('WMTS tile limits are outside the matrix.');
      }
      matrices.push(item);
    }
    if (matrices.length < 2)
      throw metadataInvalid(
        'WMTS requires at least two advertised matrix levels.'
      );
    matrices.sort((a, b) => b.scale - a.scale);
    if (
      matrices.some(
        (matrix, index) =>
          index > 0 && matrix.scale >= matrices[index - 1].scale
      )
    )
      throw metadataInvalid('WMTS matrix scales must be unique.');
    sets.push({
      id,
      code,
      matrices,
      element: `/Contents/TileMatrixSet[Identifier=${id}]/SupportedCRS`
    });
  }
  return {
    kind: 'wmts',
    sets,
    data: {
      kind: 'wmts',
      url: endpoint,
      encoding: resource ? 'rest' : 'kvp',
      layer: layerId,
      format: imageFormat,
      style,
      dimensions
    }
  };
}

async function axis(
  code: string,
  context: ProbeContext,
  latitudeFirst: boolean
): Promise<CrsRef['axisOrder']> {
  if (!latitudeFirst || code === 'OGC:CRS84') return 'xy';
  try {
    return (await context.crsRegistry.resolve(code)).projected ? 'xy' : 'yx';
  } catch (error) {
    if (error instanceof MapError && error.code === 'CRS_NOT_FOUND')
      return 'xy';
    throw error;
  }
}

/** Each map owns a cancellation-aware cache: probe/open share only that input's request. */
export function createOgcRasterSources(
  fetcher: typeof fetch = (...args) => globalThis.fetch(...args)
): Record<'wms' | 'wmts', DataSourceProvider> {
  const create = (provider: 'wms' | 'wmts'): DataSourceProvider => {
    const cache = new WeakMap<SourceInput, Promise<Metadata>>();
    const contexts = new WeakMap<SourceInput, ProbeContext>();
    const read = (
      source: SourceInput,
      signal?: AbortSignal
    ): Promise<Metadata> => {
      let pending = cache.get(source);
      if (!pending) {
        pending = (async () => {
          const inputUrl = httpUrl(option(source, 'url', true)!);
          const url = kvpUrl(inputUrl, {
            SERVICE: provider.toUpperCase(),
            REQUEST: 'GetCapabilities',
            VERSION:
              option(source, 'version') ??
              (provider === 'wms' ? '1.3.0' : '1.0.0')
          });
          const document = await fetchCapabilities(url, fetcher, signal);
          return {
            ...(provider === 'wms'
              ? parseWms(document.root, document.url, source)
              : parseWmts(document.root, document.url, source)),
            url: document.url
          };
        })();
        cache.set(source, pending);
        // Failed/aborted requests can be retried even if a caller reuses its input.
        void pending.catch(() => {
          if (cache.get(source) === pending) cache.delete(source);
        });
      }
      return pending;
    };
    return {
      crsMode: 'service-metadata',
      probe: async (source, context): Promise<ProbeResult> => {
        contexts.set(source, context);
        const metadata = await read(source, context.signal);
        context.signal?.throwIfAborted();
        const entries =
          metadata.kind === 'wms'
            ? metadata.data.supportedCrs.map((code) => ({
                code,
                element: metadata.elements.get(code)!
              }))
            : metadata.sets.map((set) => ({
                code: set.code,
                element: set.element
              }));
        return {
          kind: 'metadata',
          candidates: await Promise.all(
            entries.map(async ({ code, element }) => ({
              crs: {
                code,
                axisOrder: await axis(
                  code,
                  context,
                  metadata.kind === 'wmts' || metadata.data.version === '1.3.0'
                )
              },
              provenance: {
                kind: 'service-metadata' as const,
                url: metadata.url,
                element
              }
            }))
          )
        };
      },
      open: async (source, confirmed, context): Promise<ResolvedSource> => {
        const metadata = await read(source, context.signal);
        context.signal?.throwIfAborted();
        if (
          confirmed.provenance.kind !== 'service-metadata' ||
          confirmed.provenance.url !== metadata.url
        )
          throw new MapError('CRS_NOT_CONFIRMED');
        let data: OgcTileData;
        let spatial: ResolvedSource['spatial'];
        if (metadata.kind === 'wms') {
          if (!metadata.data.supportedCrs.includes(confirmed.crs.code))
            throw metadataInvalid('Confirmed CRS is not advertised.');
          data = metadata.data;
          spatial = {
            type: 'service',
            supportedCrs: metadata.data.supportedCrs
          };
        } else {
          const set = metadata.sets.find(
            (item) => item.code === confirmed.crs.code
          );
          if (!set)
            throw metadataInvalid('Confirmed WMTS CRS is not advertised.');
          const registry = contexts.get(source)?.crsRegistry;
          if (!registry) throw new MapError('CRS_NOT_CONFIRMED');
          const definition = await registry.resolve(set.code);
          const matrices = structuredClone(set.matrices);
          const origin = (matrix: WmtsMatrix): [number, number] =>
            confirmed.crs.axisOrder === 'yx'
              ? [matrix.origin[1], matrix.origin[0]]
              : matrix.origin;
          let grid: TileMatrix = {
            origin: origin(matrices[0]),
            resolutions: matrices.map(
              (matrix) =>
                (matrix.scale * 0.00028) /
                (definition.units === 'degrees' ? 111319.49079327358 : 1)
            )
          };
          if (
            matrices.some((matrix) =>
              origin(matrix).some(
                (coordinate, index) =>
                  Math.abs(coordinate - grid.origin[index]) > 1e-6
              )
            )
          )
            throw metadataInvalid(
              'WMTS levels do not share a top-left origin.'
            );
          // Standard EPSG:3857 matrix sets often publish rounded scale denominators.
          // Recognise only sub-micrometre origins and relative 1e-9 scale rounding.
          if (
            set.code === 'EPSG:3857' &&
            definition.tileMatrix &&
            grid.origin.every(
              (coordinate, index) =>
                Math.abs(coordinate - definition.tileMatrix!.origin[index]) <=
                1e-6
            )
          ) {
            matrices.forEach((matrix, index) => {
              const zoom = definition.tileMatrix!.resolutions.findIndex(
                (resolution) =>
                  Math.abs(resolution - grid.resolutions[index]) <=
                  resolution * 1e-9
              );
              if (zoom >= 0) matrix.zoom = zoom;
            });
            if (matrices.every((matrix) => matrix.zoom !== undefined))
              grid = {
                origin: definition.tileMatrix.origin,
                resolutions: matrices.map(
                  (matrix) => definition.tileMatrix!.resolutions[matrix.zoom!]
                )
              };
          }
          data = { ...metadata.data, matrixSet: set.id, matrices };
          spatial = { type: 'fixed-grid', crs: set.code, grid };
        }
        return {
          provider,
          crs: confirmed,
          identity: JSON.stringify(source),
          renderKind: 'raster-tiles',
          data,
          spatial,
          remote: true
        };
      }
    };
  };
  return { wms: create('wms'), wmts: create('wmts') };
}

export function assertWmtsLeafletGrid(data: WmtsTileData): void {
  if (
    !Array.isArray(data.matrices) ||
    data.matrices.length < 2 ||
    data.matrices.some(
      (matrix, index) =>
        !matrix ||
        matrix.zoom === undefined ||
        matrix.tileWidth !== 256 ||
        matrix.tileHeight !== 256 ||
        matrix.width !== 2 ** matrix.zoom ||
        matrix.height !== 2 ** matrix.zoom ||
        (index > 0 && matrix.zoom !== data.matrices[index - 1].zoom! + 1)
    )
  )
    throw new MapError('LAYER_INCOMPATIBLE', {
      reason:
        'Leaflet WMTS requires contiguous standard 256px EPSG:3857 matrix levels, matching origins, scales and matrix dimensions.'
    });
}

/** Pure OGC request construction; native adapters supply wrapped tile coordinates. */
export function ogcTileUrl(
  data: OgcTileData,
  coords: { x: number; y: number; z: number }
): string | null {
  if (data.kind === 'wms') {
    if (!data.requestCrs || !data.axisOrder)
      throw metadataInvalid(
        'WMS renderer has not selected an advertised display CRS.'
      );
    const mercator = data.requestCrs === 'EPSG:3857';
    const span = (mercator ? 2 * Math.PI * 6378137 : 180) / 2 ** coords.z;
    const west = (mercator ? -Math.PI * 6378137 : -180) + coords.x * span;
    const north = (mercator ? Math.PI * 6378137 : 90) - coords.y * span;
    const bbox =
      data.axisOrder === 'yx'
        ? [north - span, west, north, west + span]
        : [west, north - span, west + span, north];
    return kvpUrl(data.url, {
      SERVICE: 'WMS',
      REQUEST: 'GetMap',
      VERSION: data.version,
      LAYERS: data.layers.join(','),
      STYLES: data.layers.map(() => '').join(','),
      FORMAT: data.format,
      TRANSPARENT: 'TRUE',
      WIDTH: '256',
      HEIGHT: '256',
      CRS: undefined,
      SRS: undefined,
      [data.version === '1.3.0' ? 'CRS' : 'SRS']:
        data.requestCrs === 'OGC:CRS84' ? 'CRS:84' : data.requestCrs,
      BBOX: bbox.join(',')
    });
  }
  const matrix = data.matrices.find((item) => item.zoom === coords.z);
  if (
    !matrix ||
    coords.x < 0 ||
    coords.y < 0 ||
    coords.x >= matrix.width ||
    coords.y >= matrix.height ||
    (matrix.limits &&
      (coords.x < matrix.limits.minCol ||
        coords.x > matrix.limits.maxCol ||
        coords.y < matrix.limits.minRow ||
        coords.y > matrix.limits.maxRow))
  )
    return null;
  if (data.encoding === 'kvp')
    return kvpUrl(data.url, {
      ...data.dimensions,
      SERVICE: 'WMTS',
      REQUEST: 'GetTile',
      VERSION: '1.0.0',
      LAYER: data.layer,
      STYLE: data.style,
      FORMAT: data.format,
      TILEMATRIXSET: data.matrixSet,
      TILEMATRIX: matrix.id,
      TILEROW: String(coords.y),
      TILECOL: String(coords.x)
    });
  const replacements: Record<string, string> = {
    ...data.dimensions,
    TileMatrixSet: data.matrixSet,
    TileMatrix: matrix.id,
    TileRow: String(coords.y),
    TileCol: String(coords.x),
    Style: data.style,
    style: data.style
  };
  return data.url.replace(/\{([^}]+)\}/g, (_, key: string) =>
    encodeURIComponent(replacements[key])
  );
}
