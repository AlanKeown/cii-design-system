import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLeafletRuntime, MapController } from '../src/map-controller.ts';
import { FakeMapEngine } from '../src/testing.ts';
import { MapError } from '../src/errors.ts';
import {
  coordinateText,
  groundMetresPerPixel,
  ReadoutObserver,
  scaleValue
} from '../src/controls/readouts.ts';
import type { ReadoutSnapshot } from '../src/controls/readouts.ts';
import type { MapPointerEvent } from '../src/engine/types.ts';
import type { Coord } from '../src/crs/types.ts';
import type { MapConfig } from '../src/config/types.ts';

const pointer = (pixel: Coord): MapPointerEvent => ({
  type: 'move',
  pixel,
  coord: [0, 0],
  pointerType: 'mouse',
  buttons: 0,
  modifiers: { alt: false, ctrl: false, meta: false, shift: false },
  preventDefault() {}
});

test('ground scale corrects Web Mercator latitude and geographic degree units', async () => {
  const runtime = createLeafletRuntime();
  const mercator = await runtime.crs.resolve('EPSG:3857');
  const geographic = await runtime.transforms.prepare({
    source: 'EPSG:3857',
    target: 'EPSG:4326'
  });
  const project = await runtime.transforms.prepare({
    source: 'EPSG:4326',
    target: 'EPSG:3857'
  });
  assert.equal(groundMetresPerPixel(mercator, 1000, [0, 0], geographic), 1000);
  assert.ok(
    Math.abs(
      groundMetresPerPixel(
        mercator,
        1000,
        project.coordinate([0, 60]),
        geographic
      ) - 500
    ) < 1e-8
  );
  const degrees = await runtime.crs.resolve('EPSG:4326');
  const identity = await runtime.transforms.prepare({
    source: degrees.code,
    target: degrees.code
  });
  assert.ok(
    Math.abs(
      groundMetresPerPixel(degrees, 1, [0, 0], identity) - 111319.49079327358
    ) < 1e-8
  );
  assert.throws(() => groundMetresPerPixel(degrees, 1, [0, 90], identity), {
    code: 'TRANSFORM_COORDINATE_INVALID'
  });
});

test('scale labels fit CSS widths, use metres/kilometres, and support sub-metre zooms', () => {
  assert.deepEqual(scaleValue(20, 120), {
    metres: 2000,
    width: 100,
    label: '2 km'
  });
  assert.deepEqual(scaleValue(0.1, 120), {
    metres: 10,
    width: 100,
    label: '10 m'
  });
  assert.equal(scaleValue(0.00005, 120)!.label, '0.005 m');
  for (const maxWidth of [1, 32, 120])
    for (const resolution of [0.0001, 1, 1000, 1e8]) {
      const result = scaleValue(resolution, maxWidth)!;
      assert.ok(result.width > 0 && result.width <= maxWidth);
      assert.ok(result.metres <= resolution * maxWidth);
    }
  assert.equal(scaleValue(1, 0), null);
  assert.equal(scaleValue(NaN, 100), null);
});

test('coordinate labels keep core x/y order, explicit units and normalise negative zero', async () => {
  const runtime = createLeafletRuntime();
  assert.equal(
    coordinateText([151.2, -33.8], await runtime.crs.resolve('EPSG:4326')),
    'Longitude 151.200000°, latitude -33.800000°'
  );
  assert.equal(
    coordinateText(
      [-0.0001, 6240000.125],
      await runtime.crs.resolve('EPSG:7856')
    ),
    'X 0.00 m, Y 6240000.13 m'
  );
});

test('readouts coalesce pointer events, follow view/resize, reset for keyboard, and release subscriptions', async () => {
  const runtime = createLeafletRuntime();
  const display = await runtime.crs.resolve('EPSG:3857');
  const target = await runtime.crs.resolve('EPSG:4326');
  const transform = await runtime.transforms.prepare({
    source: display.code,
    target: target.code
  });
  const frames = new Set<() => void>();
  const schedule = (callback: () => void) => {
    frames.add(callback);
    return () => {
      frames.delete(callback);
    };
  };
  const flush = () => {
    const pending = [...frames];
    frames.clear();
    pending.forEach((callback) => callback());
  };
  const node = { clientWidth: 800, clientHeight: 600 };
  const engine = new FakeMapEngine();
  await engine.mount(node as HTMLElement, {
    displayCrs: display,
    view: { center: [0, 0], resolution: 1000 }
  });
  const snapshots: ReadoutSnapshot[] = [];
  const readouts = new ReadoutObserver(
    engine,
    {
      display,
      target,
      geographic: transform,
      transform,
      scale: true,
      coordinates: true,
      width: () => node.clientWidth,
      schedule
    },
    (snapshot) => snapshots.push(snapshot)
  );
  try {
    assert.equal(snapshots.at(-1)!.coordinates!.mode, 'centre');
    assert.equal(snapshots.at(-1)!.scale!.metres, 100000);
    const before = engine.getView();
    engine.dispatchPointer(pointer([410, 300]));
    engine.dispatchPointer(pointer([420, 300]));
    engine.dispatchPointer(pointer([430, 300]));
    assert.equal(frames.size, 1);
    flush();
    assert.equal(snapshots.at(-1)!.coordinates!.mode, 'pointer');
    assert.match(snapshots.at(-1)!.coordinates!.displayText, /X 30000.00 m/);
    assert.deepEqual(engine.getView(), before);
    engine.dispatchKey({ key: 'ArrowRight' } as KeyboardEvent);
    engine.setView({ center: [1000, 0] });
    flush();
    assert.equal(snapshots.at(-1)!.coordinates!.mode, 'centre');
    assert.match(snapshots.at(-1)!.coordinates!.displayText, /X 1000.00 m/);
    node.clientWidth = 100;
    engine.resize();
    flush();
    assert.ok(snapshots.at(-1)!.scale!.width <= 52);
    engine.dispatchPointer(pointer([20, 30]));
    const count = snapshots.length;
    readouts.destroy();
    flush();
    engine.dispatchPointer(pointer([30, 40]));
    assert.equal(frames.size, 0);
    assert.equal(snapshots.length, count);
  } finally {
    readouts.destroy();
    engine.destroy();
  }
});

test('a failed coordinate transform clears stale values, reports once, and recovers at the centre', async () => {
  const runtime = createLeafletRuntime();
  const display = await runtime.crs.resolve('EPSG:3857');
  const transform = await runtime.transforms.prepare({
    source: display.code,
    target: display.code
  });
  const engine = new FakeMapEngine();
  await engine.mount({ clientWidth: 800, clientHeight: 600 } as HTMLElement, {
    displayCrs: display,
    view: { center: [0, 0], resolution: 1 }
  });
  let state!: ReadoutSnapshot;
  let frame: (() => void) | undefined;
  let errors = 0;
  const observer = new ReadoutObserver(
    engine,
    {
      display,
      target: display,
      transform: {
        ...transform,
        coordinate: (coordinate) => {
          if (coordinate[0] > 0)
            throw new MapError('TRANSFORM_COORDINATE_INVALID');
          return transform.coordinate(coordinate);
        }
      },
      scale: false,
      coordinates: true,
      width: () => 800,
      schedule: (callback) => {
        frame = callback;
        return () => {
          frame = undefined;
        };
      },
      onerror: () => errors++
    },
    (snapshot) => (state = snapshot)
  );
  try {
    engine.dispatchPointer(pointer([410, 300]));
    frame!();
    assert.equal(state.coordinates, null);
    assert.equal(state.coordinateError!.code, 'TRANSFORM_COORDINATE_INVALID');
    engine.dispatchPointer(pointer([420, 300]));
    frame!();
    assert.equal(errors, 1);
    observer.useCentre();
    frame!();
    assert.equal(state.coordinateError, null);
    assert.equal(state.coordinates!.mode, 'centre');
  } finally {
    observer.destroy();
    engine.destroy();
  }
});

test('unsupported readout settings are refused before changing an existing map', async () => {
  const runtime = createLeafletRuntime();
  runtime.engines.register('fake', async () => ({ default: FakeMapEngine }));
  const controller = new MapController(
    { clientWidth: 800, clientHeight: 600 } as HTMLElement,
    runtime
  );
  const config: MapConfig = {
    engine: 'fake',
    view: { center: { crs: 'EPSG:3857', coordinates: [0, 0] }, zoom: 10 },
    layers: []
  };
  try {
    await controller.applyConfig(config);
    const engine = controller.engine;
    await assert.rejects(
      controller.applyConfig({
        ...config,
        controls: [{ id: 'coords', readoutCrs: 'EPSG:unknown' }]
      }),
      { code: 'CRS_NOT_FOUND' }
    );
    assert.equal(controller.engine, engine);
    assert.equal(controller.snapshot().readouts, null);
    await assert.rejects(
      controller.applyConfig({
        ...config,
        controls: [{ id: 'scale', position: 'top-left' }]
      }),
      { code: 'CONFIG_INVALID' }
    );
    await assert.rejects(
      controller.applyConfig({
        ...config,
        controls: [{ id: 'coords' }, { id: 'coords' }]
      }),
      { code: 'CONFIG_INVALID' }
    );
  } finally {
    controller.destroy();
  }
});
