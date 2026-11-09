import { expect, test } from '@playwright/test';
import type {} from './fixtures/adapters.ts';

for (const engine of ['openlayers', 'maplibre']) {
  test(`${engine}: Shift+arrows rotate around the live centre and report user navigation`, async ({
    page
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/adapters.html?engine=${engine}`);
    await expect
      .poll(() => page.evaluate(() => window.adapters?.rendered()))
      .toBeGreaterThan(0);
    const canvas = page.getByRole('application');
    await page.getByText('Keyboard shortcuts', { exact: true }).click();
    await expect(
      page.getByText('Shift + Right or Up rotates clockwise', { exact: false })
    ).toBeVisible();
    await canvas.focus();
    const original = await page.evaluate(() => window.adapters!.view());
    const keys = ['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown'];
    const angles = [Math.PI / 12, Math.PI / 6, Math.PI / 12, 0];
    for (const [index, key] of keys.entries()) {
      const eventCount = await page.evaluate(
        () => window.adapters!.snapshot().events.length
      );
      await page.keyboard.press(`Shift+${key}`);
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.adapters!.view())).rotation
        )
        .toBeCloseTo(angles[index], 8);
      await expect
        .poll(() =>
          page.evaluate(() => window.adapters!.snapshot().events.length)
        )
        .toBe(eventCount + 1);
      const current = await page.evaluate(() => window.adapters!.view());
      expect(current.center[0]).toBeCloseTo(original.center[0], 6);
      expect(current.center[1]).toBeCloseTo(original.center[1], 6);
      expect(current.resolution).toBeCloseTo(original.resolution, 8);
      expect(
        await page.evaluate(
          () => window.adapters!.snapshot().events.at(-1)!.source
        )
      ).toBe('user');
      await expect(canvas).toBeFocused();
    }
    // Rotation must not replace ordinary panning or introduce a keyboard trap.
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.adapters!.view())).center[0]
      )
      .toBeGreaterThan(original.center[0]);
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('button', { name: 'Zoom in', exact: true })
    ).toBeFocused();
  });

  test(`${engine}: nested keyboard suspension and tool interception block rotation`, async ({
    page
  }) => {
    await page.goto(`/adapters.html?engine=${engine}`);
    await expect
      .poll(() => page.evaluate(() => window.adapters?.rendered()))
      .toBeGreaterThan(0);
    const rotations = await page.evaluate(() => {
      const engine = window.adapters!.engine();
      const node = document.querySelector<HTMLElement>('[role="application"]')!;
      const press = () => {
        node.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'ArrowRight',
            shiftKey: true,
            bubbles: true,
            cancelable: true
          })
        );
        return engine.getView().rotation;
      };
      const first = engine.interaction.suspend(['keyboard']);
      const second = engine.interaction.suspend(['keyboard']);
      const values = [press()];
      first();
      first();
      values.push(press());
      second();
      second();
      const off = engine.interaction.onKey((event) => event.preventDefault());
      values.push(press());
      off();
      values.push(press());
      return values;
    });
    for (const rotation of rotations.slice(0, 3))
      expect(rotation).toBeCloseTo(0, 8);
    expect(rotations[3]).toBeCloseTo(Math.PI / 12, 8);
  });

  test(`${engine}: rotation wraps without changing zoom and modified shortcuts stay available to the browser`, async ({
    page
  }) => {
    await page.goto(`/adapters.html?engine=${engine}`);
    await expect
      .poll(() => page.evaluate(() => window.adapters?.rendered()))
      .toBeGreaterThan(0);
    const canvas = page.getByRole('application');
    await canvas.focus();
    await page.evaluate(() =>
      window.adapters!.engine().setView({ rotation: Math.PI - Math.PI / 24 })
    );
    await page.keyboard.press('Shift+ArrowRight');
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.adapters!.view())).rotation
      )
      .toBeCloseTo(-Math.PI + Math.PI / 24, 8);
    const before = await page.evaluate(() => window.adapters!.view());
    const consumed = await page.evaluate(() => {
      const node = document.querySelector<HTMLElement>('[role="application"]')!;
      return ['altKey', 'ctrlKey', 'metaKey'].map((modifier) => {
        const event = new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          shiftKey: true,
          [modifier]: true,
          bubbles: true,
          cancelable: true
        });
        node.dispatchEvent(event);
        return event.defaultPrevented;
      });
    });
    expect(consumed).toEqual([false, false, false]);
    expect(await page.evaluate(() => window.adapters!.view())).toEqual(before);
  });
}

test('Leaflet does not advertise rotation and keeps Shift+arrow panning', async ({
  page
}) => {
  await page.goto('/adapters.html?engine=leaflet');
  await expect
    .poll(() => page.evaluate(() => window.adapters?.rendered()))
    .toBeGreaterThan(0);
  await page.getByText('Keyboard shortcuts', { exact: true }).click();
  await expect(
    page.getByText('Shift + Right or Up rotates clockwise', { exact: false })
  ).toHaveCount(0);
  const before = await page.evaluate(() => window.adapters!.view());
  await page.getByRole('application').focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect
    .poll(
      async () => (await page.evaluate(() => window.adapters!.view())).center[0]
    )
    .toBeGreaterThan(before.center[0]);
  expect((await page.evaluate(() => window.adapters!.view())).rotation).toBe(0);
});
