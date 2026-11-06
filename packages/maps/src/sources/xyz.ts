import { MapError } from '../errors.ts';
import { coreCrsProvider } from '../crs/registry.ts';
import type { DataSourceProvider } from './geojson.ts';

/** Standard 256px, top-left-origin Web Mercator XYZ tiles (zoom 0–24). */
export interface XyzTileData {
  url: string;
}

export function assertXyzTileData(data: unknown): asserts data is XyzTileData {
  const url =
    data && typeof data === 'object' && 'url' in data ? data.url : undefined;
  if (
    typeof url !== 'string' ||
    !url.trim() ||
    url !== url.trim() ||
    /[\u0000-\u0020\u007f]/.test(url) ||
    /^(?!https?:)[a-z][\w+.-]*:/i.test(url) ||
    !['{z}', '{x}', '{y}'].every((token) => url.includes(token)) ||
    /[{}]/.test(url.replace(/\{[zxy]\}/g, ''))
  ) {
    throw new MapError('SOURCE_INVALID', {
      provider: 'xyz',
      reason:
        'XYZ requires an HTTP(S) or relative URL with only {z}, {x} and {y} placeholders.'
    });
  }
}

export const xyzSource: DataSourceProvider = {
  crsMode: 'declared',
  probe: async (source, context) => {
    context.signal?.throwIfAborted();
    assertXyzTileData(source);
    return { kind: 'hint' };
  },
  open: async (source, crs, context) => {
    context.signal?.throwIfAborted();
    assertXyzTileData(source);
    if (crs.crs.code !== 'EPSG:3857' || crs.crs.axisOrder !== 'xy')
      throw new MapError('LAYER_INCOMPATIBLE', {
        reason:
          'XYZ currently requires EPSG:3857 with x/y axes and the standard 256px grid.'
      });
    const definition = await coreCrsProvider.resolve('EPSG:3857');
    return {
      provider: 'xyz',
      crs,
      identity: source.url,
      renderKind: 'raster-tiles',
      remote: true,
      data: { url: source.url } satisfies XyzTileData,
      spatial: {
        type: 'fixed-grid',
        crs: 'EPSG:3857',
        grid: structuredClone(definition!.tileMatrix!)
      }
    };
  }
};
