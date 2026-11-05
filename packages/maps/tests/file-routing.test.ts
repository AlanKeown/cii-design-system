import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_GEOPACKAGE_BROWSER_LIMIT_BYTES,
  routeGeoPackageFile
} from '../src/index.ts';

test('approved GeoPackage default routes above 16 MiB to the server even when OPFS exists', () => {
  assert.equal(DEFAULT_GEOPACKAGE_BROWSER_LIMIT_BYTES, 16 * 1024 * 1024);
  assert.equal(routeGeoPackageFile(1).reader, 'browser-memory');
  assert.equal(routeGeoPackageFile(16 * 1024 * 1024).reader, 'browser-memory');
  assert.equal(routeGeoPackageFile(16 * 1024 * 1024 + 1).reader, 'server');
  assert.equal(
    routeGeoPackageFile(32 * 1024 * 1024, { opfsAvailable: true }).reader,
    'server'
  );
});
test('larger browser imports need an explicit fitting OPFS limit and available OPFS', () => {
  const opfsLimitBytes = 64 * 1024 * 1024;
  assert.deepEqual(
    routeGeoPackageFile(opfsLimitBytes, {
      opfsAvailable: true,
      opfsLimitBytes
    }),
    { reader: 'browser-opfs', reason: 'explicit-opfs-override' }
  );
  assert.deepEqual(
    routeGeoPackageFile(opfsLimitBytes, {
      opfsAvailable: false,
      opfsLimitBytes
    }),
    { reader: 'server', reason: 'opfs-unavailable' }
  );
  assert.equal(
    routeGeoPackageFile(opfsLimitBytes + 1, {
      opfsAvailable: true,
      opfsLimitBytes
    }).reader,
    'server'
  );
});
test('malformed sizes and runtime override limits fail before selecting a reader', () => {
  for (const value of [
    0,
    -1,
    0.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1
  ]) {
    assert.throws(() => routeGeoPackageFile(value));
    assert.throws(() => routeGeoPackageFile(1, { opfsLimitBytes: value }));
  }
});
