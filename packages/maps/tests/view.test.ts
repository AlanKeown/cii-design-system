import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createCrsRegistry,
  resolutionToZoom,
  resolveViewResolution,
  zoomToResolution
} from '../src/index.ts';
import { checkViewConformance, FakeViewEngine } from '../src/testing.ts';

test('fractional zoom uses logarithmic interpolation and round-trips irregular tables', () => {
  const matrix = { origin: [0, 0] as const, resolutions: [100, 40, 10, 2] };
  assert.equal(zoomToResolution(1.5, matrix), 20);
  for (const zoom of [-2, 0, 0.5, 1, 1.5, 2.2, 3, 5]) {
    assert.ok(
      Math.abs(
        resolutionToZoom(zoomToResolution(zoom, matrix), matrix) - zoom
      ) < 1e-10
    );
  }
  assert.throws(
    () => zoomToResolution(1, { origin: [0, 0], resolutions: [100, 100] }),
    { code: 'VIEW_INVALID' }
  );
  assert.throws(() => resolutionToZoom(0, matrix), { code: 'VIEW_INVALID' });
});

test('resolution wins over zoom; missing tile matrix never assumes Web Mercator', () => {
  const warnings: string[] = [];
  const matrix = { origin: [0, 0] as const, resolutions: [100, 50] };
  assert.equal(
    resolveViewResolution({ resolution: 20, zoom: 1 }, matrix, (message) =>
      warnings.push(message)
    ),
    20
  );
  assert.equal(warnings.length, 1);
  assert.equal(resolveViewResolution({ resolution: 20 }), 20);
  assert.throws(() => resolveViewResolution({ zoom: 1 }), {
    code: 'VIEW_INVALID'
  });
  assert.equal(new FakeViewEngine().getView().zoom, undefined);
});

test('view conformance harness runs with and without a tile matrix', async () => {
  const matrix = (await createCrsRegistry().resolve('EPSG:3857')).tileMatrix;
  for (const engine of [new FakeViewEngine(), new FakeViewEngine({ matrix })]) {
    assert.deepEqual(checkViewConformance(engine), []);
  }
});

test('fitExtent honours padding and maxZoom; invalid updates preserve state', async () => {
  const matrix = (await createCrsRegistry().resolve('EPSG:3857')).tileMatrix!;
  const engine = new FakeViewEngine({ width: 800, height: 600, matrix });
  engine.fitExtent([0, 0, 1000, 1000], { padding: 50 });
  assert.equal(engine.getView().resolution, 2);
  engine.fitExtent([0, 0, 1, 1], { maxZoom: 10 });
  assert.equal(engine.getView().resolution, zoomToResolution(10, matrix));
  const before = engine.getView();
  assert.throws(() => engine.setView({ center: [20, 20], resolution: -1 }), {
    code: 'VIEW_INVALID'
  });
  assert.deepEqual(engine.getView(), before);
  assert.throws(() => engine.fitExtent([0, 0, 1, 1], { padding: 400 }), {
    code: 'VIEW_INVALID'
  });
});
