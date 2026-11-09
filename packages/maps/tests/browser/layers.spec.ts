import { expect, test } from '@playwright/test';
import type {} from './fixtures/layers.ts';
for (const engine of ['leaflet', 'openlayers', 'maplibre']) {
  test(`${engine}: child layers patch settings/data, survive config changes, and release ownership`, async ({
    page
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/layers.html?engine=${engine}`);
    await expect
      .poll(() =>
        page.evaluate(() => window.layerProbe?.manager()?.get('child')?.status)
      )
      .toBe('ready');
    expect(await page.evaluate(() => window.layerProbe!.same())).toBe(true);
    await expect(page.getByLabel('Map attribution')).toContainText(
      'Declarative attribution'
    );
    const visible = page.getByRole('checkbox', { name: 'child', exact: true });
    await visible.uncheck();
    await expect(page.getByLabel('Map attribution')).not.toContainText(
      'Declarative attribution'
    );
    await visible.check();
    await page.evaluate(() => {
      const spec = window.layersFixture!.spec();
      spec.opacity = 0.4;
      spec.style = { stroke: { color: '#993300', width: 4 } };
      window.layersFixture!.update(spec);
    });
    await expect
      .poll(() =>
        page.evaluate(
          () => window.layerProbe!.manager()!.get('child')!.spec.opacity
        )
      )
      .toBe(0.4);
    expect(await page.evaluate(() => window.layerProbe!.same())).toBe(true);
    await page.evaluate(() => {
      const config = window.layersFixture!.config();
      config.controls = [{ id: 'layer-list' }];
      window.layersFixture!.configure(config);
    });
    await expect(
      page.getByRole('button', { name: 'Zoom in', exact: true })
    ).toHaveCount(0);
    expect(await page.evaluate(() => window.layerProbe!.same())).toBe(true);
    await page.evaluate(() => {
      const spec = window.layersFixture!.spec();
      spec.source.data = { type: 'FeatureCollection', features: [] };
      window.layersFixture!.update(spec);
    });
    await expect(
      page.getByText('child: 0 features', { exact: false })
    ).toHaveCount(1);
    expect(await page.evaluate(() => window.layerProbe!.same())).toBe(true);
    await page.evaluate(() => {
      const spec = window.layersFixture!.spec();
      spec.source.identity = 'replacement';
      window.layersFixture!.update(spec);
    });
    await expect
      .poll(() => page.evaluate(() => window.layerProbe!.same()))
      .toBe(false);
    await page.evaluate(() => window.layersFixture!.child(false));
    await expect(visible).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => window.layerProbe!.manager()!.size))
      .toBe(0);
    await page.evaluate(() => window.layersFixture!.unmount());
    await expect(
      page.getByRole('region', { name: 'Declarative sites', exact: true })
    ).toHaveCount(0);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => window.layersFixture!.errors())).toEqual(
      []
    );
  });
}

test('duplicate child IDs report an error without removing the original registration', async ({
  page
}) => {
  await page.goto('/layers.html');
  await expect
    .poll(() =>
      page.evaluate(() => window.layerProbe?.manager()?.get('child')?.status)
    )
    .toBe('ready');
  expect(await page.evaluate(() => window.layerProbe!.same())).toBe(true);
  await page.evaluate(() => window.layersFixture!.duplicate(true));
  await expect(page.getByRole('alert')).toHaveCount(1);
  expect(await page.evaluate(() => window.layerProbe!.same())).toBe(true);
  await page.evaluate(() => window.layersFixture!.duplicate(false));
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(() => window.layerProbe!.manager()!.size)).toBe(1);
});

test('invalid initial declaration recovers when a non-identity property is corrected', async ({
  page
}) => {
  await page.goto('/layers.html');
  await expect
    .poll(() =>
      page.evaluate(() => window.layerProbe?.manager()?.get('child')?.status)
    )
    .toBe('ready');
  await page.evaluate(() => window.layersFixture!.child(false));
  await expect
    .poll(() => page.evaluate(() => window.layerProbe!.manager()!.size))
    .toBe(0);
  await page.evaluate(() => {
    const spec = window.layersFixture!.spec();
    spec.opacity = 2;
    window.layersFixture!.update(spec);
    window.layersFixture!.child(true);
  });
  await expect(page.getByRole('alert')).toHaveCount(1);
  await page.evaluate(() => {
    const spec = window.layersFixture!.spec();
    spec.opacity = 0.5;
    window.layersFixture!.update(spec);
  });
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => window.layerProbe!.manager()!.get('child')?.status)
    )
    .toBe('ready');
});

for (const engine of ['leaflet', 'openlayers']) {
  test(`${engine}: CRS switching retains child ownership and source provenance`, async ({
    page
  }) => {
    await page.goto(`/layers.html?engine=${engine}`);
    await expect
      .poll(() =>
        page.evaluate(() => window.layerProbe?.manager()?.get('child')?.status)
      )
      .toBe('ready');
    expect(await page.evaluate(() => window.layerProbe!.same())).toBe(true);
    const original = await page.evaluate(
      () => window.layerProbe!.manager()!.get('child')!.spec.source.crs
    );
    await page.evaluate(() => {
      const config = window.layersFixture!.config();
      config.display = { crs: 'EPSG:4326' };
      window.layersFixture!.configure(config);
    });
    await expect(page.getByLabel('Ready count')).toHaveText('2');
    expect(await page.evaluate(() => window.layerProbe!.same())).toBe(true);
    expect(
      await page.evaluate(
        () => window.layerProbe!.manager()!.get('child')!.spec.source.crs
      )
    ).toEqual(original);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.evaluate(() => window.layersFixture!.child(false));
    await expect
      .poll(() => page.evaluate(() => window.layerProbe!.manager()!.size))
      .toBe(0);
  });
}

test('unconfirmed CRS is an actionable child error and never reaches the engine', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/layers.html');
  await expect
    .poll(() =>
      page.evaluate(() => window.layerProbe?.manager()?.get('child')?.status)
    )
    .toBe('ready');
  await page.evaluate(() => {
    const spec = window.layersFixture!.spec();
    Reflect.set(spec.source, 'crs', null);
    window.layersFixture!.update(spec);
  });
  await expect(page.getByRole('alert')).toHaveCount(1);
  await expect
    .poll(() => page.evaluate(() => window.layerProbe!.manager()!.size))
    .toBe(0);
  expect(await page.evaluate(() => window.layersFixture!.errors())).toContain(
    'child:CRS_NOT_CONFIRMED'
  );
  expect(errors).toEqual([]);
});

for (const engine of ['leaflet', 'openlayers', 'maplibre']) {
  test(`${engine}: declarative XYZ raster joins the layer list, blocks or reprojects CRS changes, and unmounts`, async ({
    page
  }) => {
    const { oracleTile } = await import('./support/tiles.ts');
    const png = oracleTile([0, 0, 1, 1], [0.5, 0.5], [220, 30, 40], 1e6);
    let requests = 0;
    let fail = true;
    await page.route('**/child-tiles/**', (route) => {
      requests++;
      return route.fulfill(
        fail
          ? { status: 503, body: 'Synthetic tile failure' }
          : { contentType: 'image/png', body: png }
      );
    });
    await page.goto(`/layers.html?engine=${engine}`);
    await expect
      .poll(() =>
        page.evaluate(() => window.layerProbe?.manager()?.get('child')?.status)
      )
      .toBe('ready');
    await page.evaluate(() => {
      const spec = window.layersFixture!.spec();
      spec.source = {
        ...spec.source,
        provider: 'xyz',
        identity: '/child-tiles/{z}/{x}/{y}.png',
        renderKind: 'raster-tiles',
        remote: true,
        data: { url: '/child-tiles/{z}/{x}/{y}.png' },
        crs: {
          ...spec.source.crs,
          crs: { code: 'EPSG:3857', axisOrder: 'xy' }
        },
        spatial: {
          type: 'fixed-grid',
          crs: 'EPSG:3857',
          grid: {
            origin: [-20037508.342789244, 20037508.342789244],
            resolutions: Array.from(
              { length: 25 },
              (_, zoom) => 156543.03392804097 / 2 ** zoom
            )
          }
        }
      };
      delete spec.style;
      window.layersFixture!.update(spec);
    });
    await expect.poll(() => requests).toBeGreaterThan(0);
    await expect(
      page.getByText('child: raster tiles', { exact: false })
    ).toHaveCount(1);
    await expect
      .poll(() =>
        page.evaluate(() =>
          window
            .layersFixture!.errors()
            .filter((code) => code === 'child:LAYER_LOAD_FAILED')
        )
      )
      .toEqual(['child:LAYER_LOAD_FAILED']);
    fail = false;
    const visible = page.getByRole('checkbox', { name: 'child', exact: true });
    const beforeRetry = requests;
    await visible.uncheck();
    await visible.check();
    await expect.poll(() => requests).toBeGreaterThan(beforeRetry);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await visible.uncheck();
    await page.evaluate(() => {
      const config = window.layersFixture!.config();
      config.display = { crs: 'EPSG:4326' };
      window.layersFixture!.configure(config);
    });
    if (engine === 'openlayers') {
      await expect(page.getByLabel('Ready count')).toHaveText('2');
      await expect(page.getByRole('alert')).toHaveCount(0);
    } else {
      await expect(page.getByRole('alert')).toHaveCount(1);
      await expect(page.getByLabel('Ready count')).toHaveText('1');
      expect(
        await page.evaluate(() => window.layersFixture!.errors())
      ).toContain(
        engine === 'leaflet'
          ? 'DISPLAY_CRS_SWITCH_BLOCKED'
          : 'DISPLAY_CRS_UNSUPPORTED'
      );
    }
    await page.evaluate(() => window.layersFixture!.child(false));
    await expect
      .poll(() => page.evaluate(() => window.layerProbe!.manager()!.size))
      .toBe(0);
  });
}
