import { expect, test } from '@playwright/test';
import type {} from './fixtures/main.ts';

test('controlled view applies after async mount, binds user movement, and reports invalid updates once', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?controlled-view');
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.mapHarness!.view())).center[0]
    )
    .toBeCloseTo(0, 7);
  await page
    .getByRole('button', { name: 'Set controlled view', exact: true })
    .click();
  // Leaflet rounds same-zoom pans to a CSS pixel; compare in screen units.
  await expect
    .poll(async () => {
      const view = await page.evaluate(() => window.mapHarness!.view());
      return Math.abs(view.center[0] - 10000) / view.resolution;
    })
    .toBeLessThanOrEqual(0.5);
  await page.getByRole('application').focus();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () =>
      Number(await page.getByLabel('Bound center').textContent())
    )
    .toBeGreaterThan(10000);
  await page
    .getByRole('button', { name: 'Invalid controlled view', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'Check the centre coordinates'
  );
  await page.waitForTimeout(100);
  await expect(page.getByLabel('Error count')).toHaveText('1');
  expect(errors).toEqual([]);
});

for (const crs of ['EPSG:4326', 'OGC:CRS84']) {
  test(`native ${crs} uses degree resolution with longitude/latitude core coordinates`, async ({
    page
  }) => {
    await page.goto(`/?display=${encodeURIComponent(crs)}`);
    await expect(page.getByLabel('Ready count')).toHaveText('1');
    const view = await page.evaluate(() => window.mapHarness!.view());
    expect(view.center[0]).toBeCloseTo(151.21, 8);
    expect(view.center[1]).toBeCloseTo(-33.87, 8);
    expect(view.resolution).toBeCloseTo(0.0001, 10);
    expect(view.zoom).toBeUndefined();
    expect(await page.evaluate(() => window.mapHarness!.hit())).toEqual([
      'site'
    ]);
  });
}

test('real Leaflet renders, patches data/style/visibility and responds to keyboard and theme', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(
    page.getByRole('region', { name: 'Fixture', exact: true })
  ).toHaveAttribute('data-map-ready', 'true');
  const canvas = page.getByRole('application', { name: 'Fixture map canvas' });
  await expect(canvas.locator('canvas')).toHaveCount(1);
  await expect
    .poll(() => page.evaluate(() => window.mapHarness!.stats()))
    .toMatchObject({ count: 1, radius: 6 });
  expect(await page.evaluate(() => window.mapHarness!.hit())).toEqual(['site']);
  const nativeCanvas = await canvas.locator('canvas').elementHandle();
  await page.getByRole('button', { name: 'Toggle size' }).click();
  await expect
    .poll(() => page.evaluate(() => window.mapHarness!.stats()))
    .toMatchObject({ radius: 12 });
  expect(await nativeCanvas!.evaluate((node) => node.isConnected)).toBe(true);
  await page.getByRole('button', { name: 'Toggle visibility' }).click();
  await expect
    .poll(() => page.evaluate(() => window.mapHarness!.stats()))
    .toMatchObject({ count: 0 });
  expect(await page.evaluate(() => window.mapHarness!.hit())).toEqual([]);
  await page.getByRole('button', { name: 'Toggle visibility' }).click();
  await expect
    .poll(() => page.evaluate(() => window.mapHarness!.stats()))
    .toMatchObject({ count: 1 });
  const color = (await page.evaluate(() => window.mapHarness!.stats())).color;
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await expect
    .poll(
      async () => (await page.evaluate(() => window.mapHarness!.stats())).color
    )
    .not.toBe(color);
  const before = await page.evaluate(() => window.mapHarness!.view());
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.mapHarness!.view())).center[0]
    )
    .toBeGreaterThan(before.center[0]);
  await page.keyboard.press('+');
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.mapHarness!.view())).resolution
    )
    .toBeLessThan(before.resolution);
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Zoom in', exact: true })
  ).toBeFocused();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  expect(errors).toEqual([]);
});

test('real adapter passes contract checks and repeatedly unmounts without leaked canvases', async ({
  page
}) => {
  await page.goto('/');
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  expect(await page.evaluate(() => window.mapHarness!.contract())).toEqual([]);
  for (let i = 1; i <= 3; i++) {
    await page.getByRole('button', { name: 'Toggle mount' }).click();
    await expect(page.getByLabel('Destroyed count')).toHaveText(String(i));
    await expect(page.locator('.leaflet-container')).toHaveCount(0);
    await page.getByRole('button', { name: 'Toggle mount' }).click();
    await expect(page.getByLabel('Ready count')).toHaveText(String(i + 1));
    await expect(page.locator('.leaflet-container')).toHaveCount(1);
  }
});

test('unmounting during the lazy engine load cannot call ready or leave a map', async ({
  page
}) => {
  await page.goto('/?delayed-engine=600');
  await page.getByRole('button', { name: 'Toggle mount' }).click();
  await page.waitForTimeout(800);
  await expect(page.getByLabel('Ready count')).toHaveText('0');
  await expect(page.getByLabel('Error count')).toHaveText('0');
  await expect(page.locator('.leaflet-container')).toHaveCount(0);
});

test('GeoJSON requests reject malformed data and recover; stale requests do not replace the current data', async ({
  page
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route('**/sites.geojson', async (route) => {
    requests++;
    if (requests === 1) {
      await gate;
      await route
        .fulfill({ json: { type: 'FeatureCollection', features: [] } })
        .catch(() => {});
    } else if (requests === 2) await route.fulfill({ json: { bad: 'data' } });
    else
      await route.fulfill({
        json: {
          type: 'Feature',
          id: 'remote-site',
          properties: {},
          geometry: { type: 'Point', coordinates: [151.21, -33.87] }
        }
      });
  });
  await page.goto('/');
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  await page.getByRole('button', { name: 'Toggle remote' }).click();
  await expect.poll(() => requests).toBe(1);
  await page.getByRole('button', { name: 'Toggle remote' }).click();
  release();
  await expect
    .poll(() => page.evaluate(() => window.mapHarness!.stats()))
    .toMatchObject({ count: 1 });
  await page.getByRole('button', { name: 'Toggle remote' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Check the file’s format and geometry'
  );
  await expect(page.getByLabel('Error count')).toHaveText('1');
  await page.getByRole('button', { name: 'Toggle remote' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.mapHarness!.stats()))
    .toMatchObject({ count: 1 });
  await page.getByRole('button', { name: 'Toggle remote' }).click();
  await expect
    .poll(() => page.evaluate(() => window.mapHarness!.hit()))
    .toEqual(['remote-site']);
  await expect(page.getByLabel('Ready count')).toHaveText('1');
});

test('untrusted properties and attribution remain text; narrow reduced-motion maps resize correctly', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 840 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  await page.getByRole('button', { name: 'Hostile property' }).click();
  await expect(page.getByLabel('Feature name')).toHaveText(
    '<img src=x onerror=alert(1)>'
  );
  await expect(page.getByLabel('Map attribution')).toContainText(
    '<img src=x onerror=alert(1)>'
  );
  await expect(page.locator('img')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  await page.setViewportSize({ width: 700, height: 840 });
  await expect
    .poll(async () =>
      page.getByRole('application').evaluate((node) => node.clientWidth)
    )
    .toBeGreaterThan(600);
  await expect(page.getByLabel('Ready count')).toHaveText('1');
});

for (const failure of ['http', 'malformed']) {
  test(`a ${failure} source and a renderer failure leave the inline layer and map usable`, async ({
    page
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/sites.geojson', (route) =>
      failure === 'http'
        ? route.fulfill({ status: 503, body: 'Unavailable' })
        : route.fulfill({ json: { bad: 'data' } })
    );
    await page.goto('/?mixed-layers');
    await expect(page.getByLabel('Ready count')).toHaveText('1');
    await expect(page.getByRole('alert')).toHaveCount(2);
    await expect(
      page.getByRole('alert').filter({ hasText: 'Layer remote' })
    ).toContainText(
      failure === 'http'
        ? 'Check your connection and the data address'
        : 'Check the file’s format and geometry'
    );
    await expect(
      page.getByRole('alert').filter({ hasText: 'Layer polar' })
    ).toContainText('Check its coordinates');
    await expect(page.getByLabel('Error count')).toHaveText('2');
    await expect
      .poll(() => page.evaluate(() => window.mapHarness!.hit()))
      .toEqual(['site']);
    await expect(
      page.getByRole('button', { name: 'Zoom in', exact: true })
    ).toBeEnabled();
    const canvas = page.getByRole('application');
    await expect(canvas).toHaveAttribute('tabindex', '0');
    await expect(canvas).toHaveAttribute('aria-busy', 'false');
    const before = await page.evaluate(() => window.mapHarness!.view());
    await canvas.focus();
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.mapHarness!.view())).center[0]
      )
      .toBeGreaterThan(before.center[0]);
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.mapHarness!.view())).resolution
      )
      .toBeLessThan(before.resolution);
    await expect(page.getByLabel('Ready count')).toHaveText('1');
    expect(errors).toEqual([]);
  });
}

test('readiness and valid layers do not wait for a stalled source, including after a config update', async ({
  page
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route('**/sites.geojson', async (route) => {
    requests++;
    await gate;
    await route.fulfill({ status: 503, body: 'Unavailable' }).catch(() => {});
  });
  try {
    await page.goto('/?mixed-layers');
    await expect.poll(() => requests).toBe(1);
    await expect(page.getByLabel('Ready count')).toHaveText('1');
    await expect
      .poll(() => page.evaluate(() => window.mapHarness!.stats()))
      .toMatchObject({ count: 1, radius: 6 });
    await expect(
      page.getByRole('button', { name: 'Zoom in', exact: true })
    ).toBeEnabled();
    await expect(page.getByRole('application')).toHaveAttribute(
      'tabindex',
      '0'
    );
    await page.getByRole('button', { name: 'Toggle size' }).click();
    await expect.poll(() => requests).toBe(2);
    await expect
      .poll(() => page.evaluate(() => window.mapHarness!.stats()))
      .toMatchObject({ count: 1, radius: 12 });
    release();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Layer remote' })
    ).toHaveCount(1);
    // One renderer error per config, plus the current remote error. The stale
    // remote request must neither report a failure nor replace current state.
    await expect(page.getByLabel('Error count')).toHaveText('3');
    await expect(page.getByLabel('Ready count')).toHaveText('1');
  } finally {
    release();
  }
});

for (const display of ['EPSG:3857', 'OGC:CRS84']) {
  for (const action of ['zoom click', 'drag', 'arrow key', '+']) {
    test(`${display} ${action} reports one user view change without an API echo`, async ({
      page
    }) => {
      await page.goto(`/?display=${encodeURIComponent(display)}`);
      await expect(page.getByLabel('Ready count')).toHaveText('1');
      // Let the initial API view notification finish before observing navigation.
      await expect
        .poll(() => page.evaluate(() => window.mapHarness!.viewEvents().length))
        .toBe(1);
      await page.evaluate(() => window.mapHarness!.clearViewEvents());
      const canvas = page.getByRole('application');
      if (action === 'zoom click') {
        await page
          .getByRole('button', { name: 'Zoom in', exact: true })
          .click();
      } else if (action === 'drag') {
        const box = (await canvas.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(
          box.x + box.width / 2 + 100,
          box.y + box.height / 2 + 30,
          { steps: 10 }
        );
        // Avoid inertia so a drag has a single, deterministic end event.
        await page.waitForTimeout(100);
        await page.mouse.up();
      } else {
        await canvas.focus();
        await page.keyboard.press(action === '+' ? '+' : 'ArrowRight');
      }
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.mapHarness!.viewEvents().map((event) => event.source)
          )
        )
        .toEqual(['user']);
      // An echo is scheduled by the binding effect and delivered on a later frame.
      await page.waitForTimeout(150);
      const events = await page.evaluate(() => window.mapHarness!.viewEvents());
      expect(events.map((event) => event.source)).toEqual(['user']);
      expect(events[0].view).toEqual(
        await page.evaluate(() => window.mapHarness!.view())
      );
      await expect(page.getByLabel('Bound center')).toHaveText(
        String(events[0].view.center[0])
      );
    });
  }
}

test('controlled and engine API view changes report once; equivalent bound views are suppressed', async ({
  page
}) => {
  await page.goto('/');
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  await expect
    .poll(() => page.evaluate(() => window.mapHarness!.viewEvents().length))
    .toBe(1);
  await page.evaluate(() => window.mapHarness!.clearViewEvents());
  await page
    .getByRole('button', { name: 'Set controlled view', exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.mapHarness!.viewEvents().map((event) => event.source)
      )
    )
    .toEqual(['api']);
  await page.waitForTimeout(150);
  expect(
    await page.evaluate(() =>
      window.mapHarness!.viewEvents().map((event) => event.source)
    )
  ).toEqual(['api']);
  await page.evaluate(() => {
    window.mapHarness!.clearViewEvents();
    window.mapHarness!.setBoundView(window.mapHarness!.view());
  });
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.mapHarness!.viewEvents())).toEqual(
    []
  );
  await page.evaluate(() => window.mapHarness!.setView({ zoom: 9 }));
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.mapHarness!.viewEvents().map((event) => event.source)
      )
    )
    .toEqual(['api']);
  await page.waitForTimeout(150);
  expect(
    await page.evaluate(() =>
      window.mapHarness!.viewEvents().map((event) => event.source)
    )
  ).toEqual(['api']);
});

test('adding a layer alongside an invalid token update recovers without duplicate registrations or a remount', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  await expect
    .poll(() => page.evaluate(() => window.mapHarness!.stats()))
    .toMatchObject({ count: 1 });
  await page.evaluate(() => {
    const config = window.mapHarness!.config();
    const existing = config.layers[0];
    const added = structuredClone(existing);
    added.id = 'added';
    // Add a new registration and invalidate a later existing layer together.
    existing.style = { stroke: { color: 'token:--cii-missing', width: 3 } };
    config.layers = [added, existing];
    window.mapHarness!.setConfig(config);
  });
  await expect(page.getByRole('alert')).toContainText(
    'check any colour token names'
  );
  await expect(page.getByLabel('Error count')).toHaveText('1');
  await expect
    .poll(() => page.evaluate(() => window.mapHarness!.stats()))
    .toMatchObject({ count: 1 });
  for (const color of ['#123456', '#654321']) {
    await page.evaluate((color) => {
      const config = window.mapHarness!.config();
      config.layers[1].style = { stroke: { color, width: 3 } };
      window.mapHarness!.setConfig(config);
    }, color);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => window.mapHarness!.stats()))
      .toMatchObject({ count: 2 });
    await expect(
      page
        .getByRole('listitem', { includeHidden: true })
        .filter({ hasText: 'added: 1 features' })
    ).toHaveCount(1);
    await expect(
      page
        .getByRole('listitem', { includeHidden: true })
        .filter({ hasText: 'sites: 1 features' })
    ).toHaveCount(1);
  }
  // Both registrations can still be removed and re-added after recovery.
  const config = await page.evaluate(() => window.mapHarness!.config());
  await page.evaluate(() => {
    const config = window.mapHarness!.config();
    config.layers = [];
    window.mapHarness!.setConfig(config);
  });
  await expect
    .poll(() => page.evaluate(() => window.mapHarness!.stats()))
    .toMatchObject({ count: 0 });
  await page.evaluate((config) => window.mapHarness!.setConfig(config), config);
  await expect
    .poll(() => page.evaluate(() => window.mapHarness!.stats()))
    .toMatchObject({ count: 2 });
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  await expect(page.getByLabel('Destroyed count')).toHaveText('0');
  await expect(page.getByLabel('Error count')).toHaveText('1');
  expect(errors).toEqual([]);
});

test('default feature outlines meet contrast in both themes and restyle without remounting', async ({
  page
}) => {
  await page.goto('/?default-style');
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  await expect
    .poll(() => page.evaluate(() => window.mapHarness!.stats()))
    .toMatchObject({ count: 1 });
  const luminance = (hex: string) => {
    const channels = hex
      .replace('#', '')
      .match(/../g)!
      .map((part) => {
        const value = parseInt(part, 16) / 255;
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const colors: string[] = [];
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark')
      await page.getByRole('button', { name: 'Toggle theme' }).click();
    const tokens = await page.getByRole('application').evaluate((node) => {
      const css = getComputedStyle(node);
      return {
        feature: css.getPropertyValue('--cii-map-feature').trim(),
        background: css.getPropertyValue('--cii-bg-subtle').trim()
      };
    });
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.mapHarness!.stats())).color
      )
      .toBe(tokens.feature);
    const values = [
      luminance(tokens.feature),
      luminance(tokens.background)
    ].sort((a, b) => a - b);
    expect((values[1] + 0.05) / (values[0] + 0.05)).toBeGreaterThanOrEqual(3);
    colors.push(tokens.feature);
  }
  expect(colors[0]).not.toBe(colors[1]);
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  await expect(page.getByLabel('Destroyed count')).toHaveText('0');
});

test('root class and HTML attributes are forwarded and description IDs are combined', async ({
  page
}) => {
  await page.goto('/');
  const root = page.getByTestId('map-root');
  await expect(root).toHaveClass(/\bcii-map\b/);
  await expect(root).toHaveClass(/\bfixture-map\b/);
  await expect(root).toHaveAttribute('aria-details', 'fixture-details');
  const ids = (await root.getAttribute('aria-describedby'))!.split(' ');
  expect(ids).toHaveLength(2);
  expect(ids).toContain('external-description');
  for (const id of ids)
    expect(await page.locator(`[id="${id}"]`).count()).toBe(1);
  await expect(root).toHaveAccessibleDescription(
    'Additional context Map description'
  );
});

test('loading surface uses spacing, typography, border and radius tokens', async ({
  page
}) => {
  await page.goto('/?delayed-engine=2000');
  const loading = page.getByRole('status').filter({ hasText: 'Loading map…' });
  await expect(loading).toBeVisible();
  await expect(loading).toHaveCSS('border-radius', '8px');
  await expect(loading).toHaveCSS('border-top-style', 'solid');
  await page.getByTestId('map-root').evaluate((node) => {
    node.style.setProperty('--cii-space-2', '10px');
    node.style.setProperty('--cii-space-3', '15px');
    node.style.setProperty('--cii-radius-input', '9px');
    node.style.setProperty('--cii-bg-card', 'rgb(10, 20, 30)');
    node.style.setProperty('--cii-font-caption', '13px');
  });
  await expect(loading).toHaveCSS('padding', '10px 15px');
  await expect(loading).toHaveCSS('border-radius', '9px');
  await expect(loading).toHaveCSS('background-color', 'rgb(10, 20, 30)');
  await expect(page.getByLabel('Map attribution')).toHaveCSS(
    'font-size',
    '13px'
  );
});

test('missing token CSS reports an actionable style error instead of fallback colours', async ({
  page
}) => {
  await page.goto('/?default-style');
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  await expect
    .poll(() => page.evaluate(() => window.mapHarness!.stats()))
    .toMatchObject({ count: 1 });
  await page.evaluate(() => {
    for (const style of document.querySelectorAll('style')) {
      if (style.textContent?.includes('--cii-map-feature:')) style.remove();
    }
    const config = window.mapHarness!.config();
    config.layers[0].style = {
      stroke: { color: 'token:--cii-map-feature', width: 3 }
    };
    window.mapHarness!.setConfig(config);
  });
  await expect(page.getByRole('alert')).toContainText(
    'import @cii/tokens/tokens.css'
  );
  await expect(page.getByRole('alert')).not.toContainText('STYLE_UNSUPPORTED');
  expect(await page.evaluate(() => window.mapHarness!.errorCodes())).toEqual([
    'STYLE_UNSUPPORTED'
  ]);
  await expect
    .poll(() => page.evaluate(() => window.mapHarness!.stats()))
    .toMatchObject({ count: 0 });
});

test('invalid configuration shows field paths, validation messages and corrections, preserving typed errors', async ({
  page
}) => {
  await page.goto('/');
  await expect(page.getByLabel('Ready count')).toHaveText('1');
  await page.evaluate(() => {
    const config = window.mapHarness!.config();
    config.layers[0].opacity = 2;
    window.mapHarness!.setConfig(config);
  });
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('/layers/0/opacity');
  await expect(alert).toContainText('must be <= 1');
  await expect(alert).toContainText('Reduce the value to the stated maximum');
  await expect(alert).not.toContainText('CONFIG_INVALID');
  expect(await page.evaluate(() => window.mapHarness!.errorCodes())).toEqual([
    'CONFIG_INVALID'
  ]);
});
