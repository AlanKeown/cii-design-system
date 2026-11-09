import { expect, test } from '@playwright/test';
import type {} from './fixtures/adapters.ts';

for (const engine of ['leaflet', 'openlayers', 'maplibre']) {
  test(`${engine}: Phase 1 landmarks, target sizes, focus order and visible focus`, async ({
    page
  }) => {
    await page.goto(`/adapters.html?engine=${engine}`);
    await expect
      .poll(() => page.evaluate(() => window.adapters?.rendered()))
      .toBeGreaterThan(0);
    const region = page.getByRole('region', {
      name: 'Adapter sites',
      exact: true
    });
    await expect(region).toHaveAccessibleDescription(
      'Synthetic site at longitude 151.21°, latitude −33.87° (GDA2020).'
    );
    const canvas = region.getByRole('application');
    await expect(canvas).toHaveAccessibleName('Adapter sites map canvas');
    await expect(canvas).toHaveAttribute('tabindex', '0');
    await expect(canvas).toHaveAccessibleDescription(/Arrow keys pan/);
    const targets = region.locator('button, input, select, summary');
    for (const target of await targets.all()) {
      if (!(await target.isVisible())) continue;
      const box = await target.boundingBox();
      expect(
        box!.width,
        (await target.getAttribute('aria-label')) ??
          (await target.textContent()) ??
          'Map target'
      ).toBeGreaterThanOrEqual(24);
      expect(box!.height).toBeGreaterThanOrEqual(24);
    }
    const stops = [
      canvas,
      region.getByRole('button', { name: 'Zoom in', exact: true }),
      region.getByRole('button', { name: 'Zoom out', exact: true }),
      region.getByRole('checkbox', { name: 'sites', exact: true }),
      region.getByRole('slider', { name: 'Opacity for sites', exact: true })
    ];
    await canvas.focus();
    for (const [index, stop] of stops.entries()) {
      if (index) await page.keyboard.press('Tab');
      await expect(stop).toBeFocused();
      const focus = await stop.evaluate((node) => {
        const css = getComputedStyle(node);
        const expected = document.createElement('span');
        expected.style.color = css.getPropertyValue('--cii-focus-ring').trim();
        return {
          style: css.outlineStyle,
          width: parseFloat(css.outlineWidth),
          color: css.outlineColor,
          expected: expected.style.color
        };
      });
      expect(focus.style).toBe('solid');
      expect(focus.width).toBeGreaterThanOrEqual(2);
      expect(focus.color).toBe(focus.expected);
    }
  });

  test(`${engine}: reduced motion jumps API views and disables drag inertia`, async ({
    page
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/adapters.html?engine=${engine}`);
    await expect
      .poll(() => page.evaluate(() => window.adapters?.rendered()))
      .toBeGreaterThan(0);
    const result = await page.evaluate(() => {
      const engine = window.adapters!.engine(),
        view = engine.getView();
      const target: [number, number] = [
        view.center[0] + 200,
        view.center[1] + 200
      ];
      engine.setView(
        { center: target, resolution: view.resolution / 2 },
        { animate: true }
      );
      return { target, view: engine.getView() };
    });
    // Leaflet reports its actual CSS-pixel rounded centre.
    expect(
      Math.hypot(
        result.view.center[0] - result.target[0],
        result.view.center[1] - result.target[1]
      ) / result.view.resolution
    ).toBeLessThan(0.75);
    expect(result.view.resolution).toBeCloseTo(5, 6);
    const canvas = page.getByRole('application');
    await canvas.focus();
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + 160, box.y + 170);
    const before = await page.evaluate(() => window.adapters!.view());
    await page.mouse.down();
    await page.mouse.move(box.x + 260, box.y + 200, { steps: 5 });
    await page.mouse.up();
    const released = await page.evaluate(() => window.adapters!.view());
    expect(
      Math.hypot(
        released.center[0] - before.center[0],
        released.center[1] - before.center[1]
      )
    ).toBeGreaterThan(100);
    // Observe beyond native post-gesture animation frames; a single immediate sample cannot detect inertia.
    await page.waitForTimeout(300);
    const settled = await page.evaluate(() => window.adapters!.view());
    expect(settled.center[0]).toBeCloseTo(released.center[0], 5);
    expect(settled.center[1]).toBeCloseTo(released.center[1], 5);
  });

  test(`${engine}: repeated native mounts and cancellation leave no map DOM or late readiness`, async ({
    page
  }) => {
    await page.goto(`/adapters.html?engine=${engine}`);
    await expect
      .poll(() => page.evaluate(() => window.adapters?.rendered()))
      .toBeGreaterThan(0);
    expect(await page.evaluate(() => window.adapters!.lifecycle())).toEqual([]);
    await expect(page.getByLabel('Ready count')).toHaveText('1');
  });
}

test('OpenLayers pinch rotation snaps without a release animation under reduced motion', async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/adapters.html?engine=openlayers');
  await expect
    .poll(() => page.evaluate(() => window.adapters?.rendered()))
    .toBeGreaterThan(0);
  const canvas = page.getByRole('application');
  await canvas.focus();
  const box = (await canvas.boundingBox())!;
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    maxTouchPoints: 2
  });
  const points = (angle: number) => {
    const x = Math.cos((angle * Math.PI) / 180) * 65,
      y = Math.sin((angle * Math.PI) / 180) * 65;
    return [
      { id: 0, x: box.x + 250 - x, y: box.y + 200 - y },
      { id: 1, x: box.x + 250 + x, y: box.y + 200 + y }
    ];
  };
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: points(0)
  });
  for (const angle of [10, 35, 10, 13])
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: points(angle)
    });
  const rotated = await page.evaluate(() => window.adapters!.view().rotation);
  expect(Math.abs(rotated)).toBeGreaterThan(0.01);
  expect(Math.abs(rotated)).toBeLessThan(0.08);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: []
  });
  expect(
    await page.evaluate(() =>
      window
        .adapters!.engine()
        .native<import('ol/Map.js').default>()
        .getView()
        .getAnimating()
    )
  ).toBe(false);
  expect(
    Math.abs(await page.evaluate(() => window.adapters!.view().rotation))
  ).toBeLessThan(0.001);
});

for (const engine of ['leaflet', 'openlayers', 'maplibre']) {
  test(`${engine}: default CRS and unknown-CRS rejection never substitute a display`, async ({
    page
  }) => {
    await page.goto(`/adapters.html?engine=${engine}`);
    await expect
      .poll(() => page.evaluate(() => window.adapters?.rendered()))
      .toBeGreaterThan(0);
    await page.evaluate(() => {
      const config = window.adapters!.config();
      delete config.display;
      window.adapters!.update(config);
    });
    const region = page.getByRole('region', {
      name: 'Adapter sites',
      exact: true
    });
    await expect(region).toHaveAttribute('data-display-crs', 'EPSG:3857');
    const previous = await page.evaluate(() => window.adapters!.view());
    await page.evaluate(() => window.adapters!.switchTo('EPSG:999999'));
    await expect
      .poll(() => page.evaluate(() => window.adapters!.snapshot().errors))
      .toEqual(['CRS_NOT_FOUND']);
    await expect(region).toHaveAttribute('data-display-crs', 'EPSG:3857');
    await expect(page.getByLabel('Ready count')).toHaveText('1');
    expect(await page.evaluate(() => window.adapters!.view())).toEqual(
      previous
    );
  });

  test(`${engine}: native default outlines follow both themes and meet canvas contrast`, async ({
    page
  }) => {
    await page.goto(`/adapters.html?engine=${engine}`);
    await expect
      .poll(() => page.evaluate(() => window.adapters?.rendered()))
      .toBeGreaterThan(0);
    await page.evaluate(() => {
      const config = window.adapters!.config();
      config.layers[0].style = {};
      window.adapters!.update(config);
    });
    const samples: number[][] = [];
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark')
        await page
          .getByRole('button', { name: 'Toggle theme', exact: true })
          .click();
      await expect
        .poll(async () => {
          const colors = await page.evaluate((engine) => {
            const native = window.adapters!.engine();
            let color: unknown;
            if (engine === 'leaflet')
              native.native<import('leaflet').Map>().eachLayer((layer) => {
                if ('getLatLng' in layer && 'options' in layer)
                  color = (layer as import('leaflet').CircleMarker).options
                    .color;
              });
            else if (engine === 'maplibre') {
              const map = native.native<import('maplibre-gl').Map>();
              const id = map
                .getStyle()
                .layers!.find((layer) => layer.type === 'circle')!.id;
              color = map.getPaintProperty(id, 'circle-stroke-color');
            } else {
              const layer = native
                .native<import('ol/Map.js').default>()
                .getLayers()
                .getArray()[0] as import('ol/layer/Vector.js').default;
              const style = layer.getStyleFunction()!(
                layer.getSource()!.getFeatures()[0],
                1
              );
              if (!style)
                throw new Error('Native feature style is unavailable.');
              color = (Array.isArray(style) ? style[0] : style)
                .getStroke()!
                .getColor();
            }
            const css = getComputedStyle(
              document.querySelector<HTMLElement>('[role="application"]')!
            );
            const rgb = (value: unknown): number[] => {
              if (Array.isArray(value)) return value.slice(0, 3);
              if (typeof value !== 'string') return [];
              const canvas = document.createElement('canvas');
              canvas.width = canvas.height = 1;
              const context = canvas.getContext('2d')!;
              context.fillStyle = value;
              context.fillRect(0, 0, 1, 1);
              return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
            };
            return {
              actual: rgb(color),
              expected: rgb(css.getPropertyValue('--cii-map-feature').trim()),
              background: rgb(css.getPropertyValue('--cii-map-surface').trim())
            };
          }, engine);
          const luminance = (channels: number[]) =>
            channels
              .map((channel) => {
                const value = channel / 255;
                return value <= 0.04045
                  ? value / 12.92
                  : ((value + 0.055) / 1.055) ** 2.4;
              })
              .reduce(
                (sum, value, index) =>
                  sum + value * [0.2126, 0.7152, 0.0722][index],
                0
              );
          const light = [
            luminance(colors.expected),
            luminance(colors.background)
          ].sort((a, b) => a - b);
          expect((light[1] + 0.05) / (light[0] + 0.05)).toBeGreaterThanOrEqual(
            3
          );
          if (
            JSON.stringify(colors.actual) === JSON.stringify(colors.expected)
          ) {
            samples[theme === 'light' ? 0 : 1] = colors.actual;
            return true;
          }
          return false;
        })
        .toBe(true);
    }
    expect(samples[0]).not.toEqual(samples[1]);
    await expect(page.getByLabel('Ready count')).toHaveText('1');
  });
}
