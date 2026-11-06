import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRegistries, resolveSourceCrs } from '../src/index.ts';
import { createLeafletRuntime } from '../src/map-controller.ts';
import {
  assertWmtsLeafletGrid,
  ogcTileUrl
} from '../src/sources/ogc-raster.ts';
import type {
  OgcTileData,
  WmsTileData,
  WmtsTileData
} from '../src/sources/ogc-raster.ts';
import type { ServiceSourceConfig } from '../src/config/types.ts';
import { parseCapabilities, crsCode } from '../src/sources/ogc-metadata.ts';
import { wmsCapabilities, wmtsCapabilities } from './support/ogc.ts';

function input(provider: 'wms' | 'wmts'): ServiceSourceConfig {
  return {
    provider,
    url: '/catalogue',
    crs: { fromMetadata: true, policy: 'prefer-display' },
    ...(provider === 'wms'
      ? { layers: 'demo,second' }
      : { layer: 'demo', matrixSet: 'web' })
  };
}
async function open(xml: string, source = input('wms'), display = 'EPSG:3857') {
  let requests = 0;
  const registries = createRegistries({
    fetch: async (url) => {
      requests++;
      assert.equal(
        new URL(String(url), 'https://fixture.test').searchParams.get(
          'REQUEST'
        ),
        'GetCapabilities'
      );
      return new Response(xml);
    }
  });
  const context = {
    sources: registries.sources,
    crsRegistry: registries.crs,
    displayCrs: display
  };
  const confirmed = await resolveSourceCrs(source, context);
  assert.ok(confirmed.ok, !confirmed.ok ? confirmed.error.message : '');
  const resolved = await registries.sources
    .require(source.provider)
    .open(source, confirmed.value, {});
  assert.equal(requests, 1);
  return { confirmed: confirmed.value, resolved, registries };
}

test('WMS inherits CRS metadata, intersects named layers, preserves provenance and shares probe/open I/O', async () => {
  const { confirmed, resolved } = await open(wmsCapabilities());
  assert.equal(confirmed.crs.code, 'EPSG:3857');
  assert.equal(confirmed.provenance.kind, 'service-metadata');
  if (confirmed.provenance.kind === 'service-metadata') {
    assert.match(confirmed.provenance.element, /Layer\[1\]\/CRS\[2\]/);
    assert.match(confirmed.provenance.url, /REQUEST=GetCapabilities/);
  }
  assert.deepEqual(resolved.spatial, {
    type: 'service',
    supportedCrs: ['EPSG:4326', 'EPSG:3857', 'OGC:CRS84']
  });
  assert.equal((resolved.data as WmsTileData).url, '/ogc/maps');
  const native = input('wms');
  native.crs = { fromMetadata: true };
  assert.equal(
    (await open(wmsCapabilities(), native)).confirmed.crs.axisOrder,
    'yx'
  );
});

for (const version of ['1.1.1', '1.3.0'] as const) {
  for (const code of ['EPSG:4326', 'OGC:CRS84', 'EPSG:3857']) {
    test(`WMS ${version} constructs the advertised ${code} request with the correct BBOX order`, async () => {
      const source = input('wms');
      source.version = version;
      const { resolved, confirmed } = await open(
        wmsCapabilities(version),
        source,
        code
      );
      const runtime = createLeafletRuntime();
      const prepared = await runtime.renderers
        .require('leaflet:raster-tiles')
        .prepare(resolved, {
          engineId: 'leaflet',
          capabilities: {
            displayCrs: () => 'native',
            renderKinds: new Set(['raster-tiles']),
            rasterReprojection: false,
            rotation: false,
            styleFeatures: new Set()
          },
          displayCrs: await runtime.crs.resolve(code),
          signal: new AbortController().signal
        });
      const data = prepared.data as OgcTileData;
      const params = new URL(
        ogcTileUrl(data, { x: 0, y: 0, z: 0 })!,
        'https://fixture.test'
      ).searchParams;
      assert.equal(params.get('REQUEST'), 'GetMap');
      assert.equal(
        params.get(version === '1.3.0' ? 'CRS' : 'SRS'),
        code === 'OGC:CRS84' ? 'CRS:84' : code
      );
      assert.equal(params.get('LAYERS'), 'demo,second');
      assert.equal(params.get('STYLES'), ',');
      const bbox = params.get('BBOX')!.split(',').map(Number);
      if (code === 'EPSG:3857')
        assert.ok(Math.abs(bbox[0] + Math.PI * 6378137) < 1e-7);
      else
        assert.deepEqual(
          bbox,
          version === '1.3.0' && code === 'EPSG:4326'
            ? [-90, -180, 90, 0]
            : [-180, -90, 0, 90]
        );
      assert.equal(
        confirmed.crs.axisOrder,
        version === '1.3.0' && code === 'EPSG:4326' ? 'yx' : 'xy'
      );
    });
  }
}

test('WMTS honours matrix identifiers, decimal scale rounding, limits and REST/KVP encodings', async () => {
  for (const rest of [false, true]) {
    const { resolved } = await open(
      wmtsCapabilities({ rest, limits: true, maxZoom: 24 }),
      input('wmts')
    );
    const data = resolved.data as WmtsTileData;
    assertWmtsLeafletGrid(data);
    assert.equal(data.matrices[2].zoom, 2);
    assert.equal(data.matrices.at(-1)!.zoom, 24);
    const url = ogcTileUrl(data, { x: 0, y: 0, z: 2 })!;
    if (rest) assert.equal(url, '/ogc/tiles/web/level-2/0/0.png');
    else {
      const params = new URL(url, 'https://fixture.test').searchParams;
      assert.equal(params.get('TILEMATRIX'), 'level-2');
      assert.equal(params.get('TILEMATRIXSET'), 'web');
      assert.equal(params.get('STYLE'), 'normal');
    }
    assert.equal(ogcTileUrl(data, { x: 1, y: 0, z: 2 }), null);
    assert.equal(ogcTileUrl(data, { x: 0, y: 1, z: 2 }), null);
    assert.equal(ogcTileUrl(data, { x: 0, y: 0, z: 25 }), null);
  }
  const { resolved } = await open(
    wmtsCapabilities({ size: 512 }),
    input('wmts')
  );
  assert.throws(() => assertWmtsLeafletGrid(resolved.data as WmtsTileData), {
    code: 'LAYER_INCOMPATIBLE'
  });
});

test('malformed capabilities, unavailable layers, grids, endpoints and XML entities fail closed', async () => {
  const examples = [
    { xml: '<ServiceExceptionReport/>', source: input('wms') },
    {
      xml: wmsCapabilities().replace(
        '<Name>demo</Name>',
        '<Name>missing</Name>'
      ),
      source: input('wms')
    },
    {
      xml: wmsCapabilities().replace('/ogc/maps', 'javascript:bad'),
      source: input('wms')
    },
    {
      xml: wmsCapabilities().replace(
        '<Layer><Name>demo',
        '<Layer noSubsets="1"><Name>demo'
      ),
      source: input('wms')
    },
    {
      xml: wmtsCapabilities().replace(
        '<TileMatrixSet>web</TileMatrixSet>',
        '<TileMatrixSet>missing</TileMatrixSet>'
      ),
      source: input('wmts')
    },
    {
      xml: wmtsCapabilities({ rest: true }).replace('{TileRow}', '{unknown}'),
      source: input('wmts')
    },
    {
      xml: wmtsCapabilities({ limits: true }).replace(
        '<MaxTileRow>0',
        '<MaxTileRow>100'
      ),
      source: input('wmts')
    }
  ];
  for (const example of examples) {
    const registries = createRegistries({
      fetch: async () => new Response(example.xml)
    });
    const result = await resolveSourceCrs(example.source, {
      sources: registries.sources,
      crsRegistry: registries.crs,
      displayCrs: 'EPSG:3857'
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'CRS_METADATA_INVALID');
  }
  for (const xml of [
    '<Capabilities>',
    '<!DOCTYPE x [<!ENTITY a "bad">]><x/>',
    '<!DOCTYPE x [<!ENTITY a SYSTEM "file:///etc/passwd">]><x/>'
  ])
    assert.throws(() => parseCapabilities(xml), {
      code: 'CRS_METADATA_INVALID'
    });
  assert.throws(
    () => parseCapabilities('<x>' + 'a'.repeat(2 * 1024 * 1024) + '</x>'),
    { code: 'SOURCE_TOO_LARGE' }
  );
  assert.equal(
    crsCode('http://www.opengis.net/def/crs/EPSG/0/3857'),
    'EPSG:3857'
  );
});

test('metadata transport forwards cancellation, recovers failed reads and refuses declared service CRSs', async () => {
  const source = input('wms');
  let call = 0;
  const abort = new AbortController();
  const registries = createRegistries({
    fetch: async (_url, init) => {
      assert.equal(init?.signal, abort.signal);
      if (++call === 1) return new Response('unavailable', { status: 503 });
      return new Response(wmsCapabilities());
    }
  });
  const context = {
    sources: registries.sources,
    crsRegistry: registries.crs,
    displayCrs: 'EPSG:3857',
    signal: abort.signal
  };
  await assert.rejects(
    registries.sources.require('wms').probe(source, context),
    { code: 'SOURCE_LOAD_FAILED' }
  );
  const recovered = await resolveSourceCrs(source, context);
  assert.ok(recovered.ok);
  const declared = await resolveSourceCrs(
    {
      ...source,
      crs: {
        code: 'EPSG:3857',
        provenance: { kind: 'declared' as const, by: 'test' }
      }
    },
    context
  );
  assert.equal(declared.ok, false);
  if (!declared.ok)
    assert.equal(declared.error.code, 'CRS_DECLARATION_NOT_ALLOWED');
  abort.abort();
  await assert.rejects(
    registries.sources.require('wms').probe(input('wms'), context),
    { name: 'AbortError' }
  );
});
