import { expect, test } from '@playwright/test';
import type {} from './fixtures/adapters.ts';
import reference from '../fixtures/postgis-accuracy.json' with { type: 'json' };
const mga = reference.fixtures.find(
  (fixture) => fixture.id === 'projection-3'
)!.expected;

for (const engine of ['openlayers', 'leaflet', 'maplibre']) {
  for (const display of engine === 'maplibre'
    ? ['EPSG:3857']
    : ['EPSG:3857', 'EPSG:7856']) {
    test(`${engine} ${display}: native rendering, view contract, controls and cleanup`, async ({
      page
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(
        `/adapters.html?engine=${engine}&display=${encodeURIComponent(display)}`
      );
      await expect(page.getByLabel('Ready count')).toHaveText('1');
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect
        .poll(() => page.evaluate(() => window.adapters!.rendered()))
        .toBeGreaterThan(0);
      const view = await page.evaluate(() => window.adapters!.view());
      if (display === 'EPSG:7856') {
        expect(view.center[0]).toBeCloseTo(mga[0], 0);
        expect(view.center[1]).toBeCloseTo(mga[1], 0);
      }
      expect(view.resolution).toBeCloseTo(10, 5);
      expect(
        await page.evaluate(() => {
          const engine = window.adapters!.engine();
          const pixel = engine.coordToPixel(engine.pixelToCoord([123, 234]));
          return Math.hypot(pixel[0] - 123, pixel[1] - 234);
        })
      ).toBeLessThan(0.01);
      const canvas = page.getByRole('application');
      await canvas.focus();
      await page.keyboard.press('ArrowRight');
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.adapters!.view())).center[0]
        )
        .toBeGreaterThan(view.center[0]);
      await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.adapters!.view())).resolution
        )
        .toBeLessThan(view.resolution);
      await expect(page.getByLabel('Map attribution')).toContainText(
        '<b>Synthetic sites</b>'
      );
      await expect(page.getByLabel('Map attribution').locator('b')).toHaveCount(
        0
      );
      expect(await page.evaluate(() => window.adapters!.contract())).toEqual(
        []
      );
      await page.evaluate(() => window.adapters!.unmount());
      await expect(canvas).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
}

for (const engine of ['openlayers', 'leaflet']) {
  test(`${engine}: atomic MGA switching preserves local layer settings and original CRS`, async ({
    page
  }) => {
    await page.goto(`/adapters.html?engine=${engine}`);
    await expect
      .poll(() => page.evaluate(() => window.adapters?.rendered()))
      .toBeGreaterThan(0);
    await page.evaluate(() => window.adapters!.switchTo('EPSG:7856'));
    await expect
      .poll(() => page.evaluate(() => window.adapters!.snapshot().switches))
      .toEqual(['EPSG:7856']);
    await expect
      .poll(() => page.evaluate(() => window.adapters!.rendered()))
      .toBeGreaterThan(0);
    const switched = await page.evaluate(() => window.adapters!.view());
    expect(
      Math.abs(switched.center[0] - mga[0]) / switched.resolution
    ).toBeLessThan(0.6);
    await page.evaluate(() => window.adapters!.switchTo('EPSG:3857'));
    await expect(page.getByLabel('Ready count')).toHaveText('3');
    await expect
      .poll(() => page.evaluate(() => window.adapters!.rendered()))
      .toBeGreaterThan(0);
    expect(
      await page.evaluate(() => window.adapters!.snapshot().errors)
    ).toEqual([]);
  });
}

test('Leaflet projected display without an explicit grid fails and retains the active map', async ({
  page
}) => {
  await page.goto('/adapters.html?engine=leaflet&no-grid');
  await expect
    .poll(() => page.evaluate(() => window.adapters?.rendered()))
    .toBeGreaterThan(0);
  await page.evaluate(() => window.adapters!.switchTo('EPSG:7856'));
  await expect
    .poll(() => page.evaluate(() => window.adapters!.snapshot().errors))
    .toEqual(['DISPLAY_CRS_UNSUPPORTED']);
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  expect(
    await page.evaluate(() => window.adapters!.rendered())
  ).toBeGreaterThan(0);
});

test('MapLibre refuses projected display without changing the live map', async ({
  page
}) => {
  await page.goto('/adapters.html?engine=maplibre');
  await expect
    .poll(() => page.evaluate(() => window.adapters?.rendered()))
    .toBeGreaterThan(0);
  await page.evaluate(() => window.adapters!.switchTo('EPSG:7856'));
  await expect
    .poll(() => page.evaluate(() => window.adapters!.snapshot().errors))
    .toEqual(['DISPLAY_CRS_UNSUPPORTED']);
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  expect(
    await page.evaluate(() => window.adapters!.rendered())
  ).toBeGreaterThan(0);
});

for (const engine of ['openlayers', 'maplibre', 'leaflet']) {
  for (const provider of ['xyz', 'wms', 'wmts'] as const) {
    test(`${engine}: ${provider} requests, rendered pixels, visibility and teardown`, async ({
      page
    }) => {
      const { wmsCapabilities, wmtsCapabilities } =
        await import('../support/ogc.ts');
      const { oracleTile } = await import('./support/tiles.ts');
      const png = oracleTile([0, 0, 1, 1], [0.5, 0.5], [220, 30, 40], 1e6);
      let requests = 0;
      await page.route('**/ogc/**', (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith('capabilities'))
          return route.fulfill({
            contentType: 'text/xml',
            body:
              provider === 'wms'
                ? wmsCapabilities()
                : wmtsCapabilities({ maxZoom: 18 })
          });
        requests++;
        return route.fulfill({ contentType: 'image/png', body: png });
      });
      await page.goto(`/adapters.html?engine=${engine}`);
      await expect
        .poll(() => page.evaluate(() => window.adapters?.rendered()))
        .toBeGreaterThan(0);
      await page.evaluate((provider) => {
        const config = window.adapters!.config();
        config.layers.unshift({
          id: 'raster',
          attribution: 'Synthetic raster',
          order: -1,
          source:
            provider === 'xyz'
              ? {
                  provider,
                  url: '/ogc/xyz/{z}/{x}/{y}.png',
                  crs: {
                    code: 'EPSG:3857',
                    provenance: { kind: 'declared', by: 'fixture' }
                  }
                }
              : {
                  provider,
                  url: `/ogc/${provider}-capabilities`,
                  crs: { fromMetadata: true },
                  ...(provider === 'wms'
                    ? { layers: 'demo' }
                    : { layer: 'demo', matrixSet: 'web' })
                }
        });
        window.adapters!.update(config);
      }, provider);
      await expect.poll(() => requests).toBeGreaterThan(0);
      await expect.poll(() => rasterPixels(page, engine)).toBeGreaterThan(0);
      const toggle = page.getByRole('checkbox', {
        name: 'raster',
        exact: true
      });
      await toggle.uncheck();
      await expect.poll(() => rasterPixels(page, engine)).toBe(0);
      await toggle.check();
      await expect.poll(() => rasterPixels(page, engine)).toBeGreaterThan(0);
      await expect(page.getByRole('alert')).toHaveCount(0);
      await page.evaluate(() => window.adapters!.unmount());
      await expect(
        page.locator('.ol-viewport, .maplibregl-map, .leaflet-container')
      ).toHaveCount(0);
    });
  }
}

for (const provider of ['xyz', 'wms', 'wmts'] as const) {
  test(`OpenLayers reprojects native ${provider} raster tiles into MGA`, async ({
    page
  }) => {
    const { wmsCapabilities, wmtsCapabilities } =
      await import('../support/ogc.ts');
    const { oracleTile } = await import('./support/tiles.ts');
    const png = oracleTile([0, 0, 1, 1], [0.5, 0.5], [220, 30, 40], 1e6);
    let requests = 0;
    await page.route('**/ogc/**', (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('capabilities'))
        return route.fulfill({
          contentType: 'text/xml',
          body:
            provider === 'wms'
              ? wmsCapabilities('1.3.0', '/ogc/maps', ['EPSG:3857'])
              : wmtsCapabilities({ maxZoom: 18 })
        });
      requests++;
      return route.fulfill({ contentType: 'image/png', body: png });
    });
    await page.goto('/adapters.html?engine=openlayers&display=EPSG%3A7856');
    await expect
      .poll(() => page.evaluate(() => window.adapters?.rendered()))
      .toBeGreaterThan(0);
    await page.evaluate((provider) => {
      const config = window.adapters!.config();
      config.layers.unshift({
        id: 'raster',
        attribution: 'Native Mercator raster',
        order: -1,
        source:
          provider === 'xyz'
            ? {
                provider,
                url: '/ogc/xyz/{z}/{x}/{y}.png',
                crs: {
                  code: 'EPSG:3857',
                  provenance: { kind: 'declared', by: 'fixture' }
                }
              }
            : {
                provider,
                url: `/ogc/${provider}-capabilities`,
                crs: { fromMetadata: true },
                ...(provider === 'wms'
                  ? { layers: 'demo' }
                  : { layer: 'demo', matrixSet: 'web' })
              }
      });
      window.adapters!.update(config);
    }, provider);
    await expect.poll(() => requests).toBeGreaterThan(0);
    await expect
      .poll(() => rasterPixels(page, 'openlayers'))
      .toBeGreaterThan(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}

async function rasterPixels(
  page: import('@playwright/test').Page,
  engine: string
): Promise<number> {
  return page.evaluate(async (engine) => {
    if (engine === 'leaflet')
      return document.querySelectorAll('img.leaflet-tile-loaded').length;
    const count = (data: Uint8Array | Uint8ClampedArray) => {
      let count = 0;
      for (let i = 0; i < data.length; i += 4)
        if (
          data[i] > 180 &&
          data[i + 1] < 80 &&
          data[i + 2] < 80 &&
          data[i + 3] > 100
        )
          count++;
      return count;
    };
    if (engine === 'openlayers')
      return [
        ...document.querySelectorAll<HTMLCanvasElement>('.ol-layer canvas')
      ].reduce(
        (total, canvas) =>
          total +
          count(
            canvas
              .getContext('2d')!
              .getImageData(0, 0, canvas.width, canvas.height).data
          ),
        0
      );
    const native = window
      .adapters!.engine()
      .native<import('maplibre-gl').Map>();
    return new Promise<number>((resolve) => {
      native.once('render', () => {
        const canvas = native.getCanvas(),
          gl = canvas.getContext('webgl2')!;
        const bytes = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(
          0,
          0,
          canvas.width,
          canvas.height,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          bytes
        );
        resolve(count(bytes));
      });
      native.triggerRepaint();
    });
  }, engine);
}

for (const engine of ['openlayers', 'maplibre']) {
  test(`${engine}: rotated view agrees with native pixels and keyboard pan`, async ({
    page
  }) => {
    await page.goto(`/adapters.html?engine=${engine}`);
    await expect
      .poll(() => page.evaluate(() => window.adapters?.rendered()))
      .toBeGreaterThan(0);
    const residual = await page.evaluate((id) => {
      const engine = window.adapters!.engine(),
        view = engine.getView();
      engine.setView({ rotation: Math.PI / 3 });
      const point: [number, number] = [
        view.center[0] + 100,
        view.center[1] + 200
      ];
      const expected = engine.coordToPixel(point);
      const map = engine.native<
        import('maplibre-gl').Map | import('ol/Map.js').default
      >();
      const native =
        id === 'openlayers'
          ? (map as import('ol/Map.js').default).getPixelFromCoordinate(point)!
          : (() => {
              const radius = 6378137,
                radians = Math.PI / 180;
              const value = (map as import('maplibre-gl').Map).project([
                point[0] / radius / radians,
                (2 * Math.atan(Math.exp(point[1] / radius)) - Math.PI / 2) /
                  radians
              ]);
              return [value.x, value.y];
            })();
      return Math.hypot(expected[0] - native[0], expected[1] - native[1]);
    }, engine);
    expect(residual).toBeLessThan(0.01);
    const before = await page.evaluate(() => window.adapters!.view());
    await page.getByRole('application').focus();
    await page.keyboard.press('ArrowRight');
    const after = await page.evaluate(() => window.adapters!.view());
    expect(after.rotation).toBeCloseTo(before.rotation, 6);
    expect(
      Math.hypot(
        after.center[0] - before.center[0],
        after.center[1] - before.center[1]
      )
    ).toBeGreaterThan(100);
  });
}

test('MapLibre rejects polar features rather than silently clipping them', async ({
  page
}) => {
  await page.goto('/adapters.html?engine=maplibre');
  await expect
    .poll(() => page.evaluate(() => window.adapters?.rendered()))
    .toBeGreaterThan(0);
  await page.evaluate(() => {
    const config = window.adapters!.config();
    config.layers.push({
      id: 'polar',
      source: {
        provider: 'inline',
        crs: {
          code: 'OGC:CRS84',
          provenance: { kind: 'declared', by: 'fixture' }
        },
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: { type: 'Point', coordinates: [0, 89] }
            }
          ]
        }
      }
    });
    window.adapters!.update(config);
  });
  await expect
    .poll(() => page.evaluate(() => window.adapters!.snapshot().errors))
    .toEqual(['LAYER_INCOMPATIBLE']);
  expect(
    await page.evaluate(() => window.adapters!.rendered())
  ).toBeGreaterThan(0);
});
