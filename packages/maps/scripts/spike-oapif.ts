import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, request } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { withPostgis } from './support/postgis.ts';

const python = process.env.CII_PYGEOAPI_PYTHON;
if (!python)
  throw new Error(
    'Set CII_PYGEOAPI_PYTHON to an isolated Python 3.12 environment with pygeoapi==0.23.3, psycopg2-binary and geoalchemy2.'
  );
const directory = await mkdtemp(join(tmpdir(), 'cii-oapif-'));
const listen = (server: Server) =>
  new Promise<number>((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve((server.address() as AddressInfo).port)
    )
  );
const close = (server: Server) =>
  new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
try {
  await withPostgis(
    async (query, databasePort) => {
      await query(
        'CREATE TABLE spike_sites(id integer PRIMARY KEY,name text,geom geometry(Point,7856));'
      );
      const reservation = createServer();
      const backendPort = await listen(reservation);
      await close(reservation);
      const proxy = createServer((incoming, outgoing) => {
        if (incoming.headers.authorization !== 'Bearer spike-token') {
          outgoing.writeHead(401);
          outgoing.end();
          return;
        }
        const upstream = request(
          {
            hostname: '127.0.0.1',
            port: backendPort,
            path: incoming.url,
            method: incoming.method,
            headers: { ...incoming.headers, host: `127.0.0.1:${backendPort}` }
          },
          (response) => {
            outgoing.writeHead(response.statusCode ?? 502, response.headers);
            response.pipe(outgoing);
          }
        );
        upstream.on('error', () => {
          if (!outgoing.headersSent) outgoing.writeHead(502);
          outgoing.end();
        });
        incoming.pipe(upstream);
      });
      const proxyPort = await listen(proxy),
        base = `http://127.0.0.1:${proxyPort}`;
      const config = {
        server: {
          bind: { host: '127.0.0.1', port: backendPort },
          url: base,
          languages: ['en-US'],
          encoding: 'utf-8',
          mimetype: 'application/json',
          pretty_print: false,
          limit: 10
        },
        logging: { level: 'ERROR' },
        metadata: {
          identification: {
            title: 'S6 disposable probe',
            description: 'Synthetic data',
            keywords: [],
            keywords_type: 'theme',
            terms_of_service: '',
            url: base
          },
          license: { name: 'test', url: base },
          provider: { name: 'test', url: base },
          contact: {}
        },
        resources: {
          sites: {
            type: 'collection',
            title: 'Sites',
            description: 'Synthetic sites',
            keywords: [],
            extents: {
              spatial: {
                bbox: [-180, -90, 180, 90],
                crs: 'http://www.opengis.net/def/crs/OGC/1.3/CRS84'
              }
            },
            providers: [
              {
                type: 'feature',
                name: 'PostgreSQL',
                data: {
                  host: '127.0.0.1',
                  port: databasePort,
                  dbname: 'postgres',
                  user: 'postgres'
                },
                id_field: 'id',
                geom_field: 'geom',
                table: 'spike_sites',
                editable: true,
                storage_crs: 'http://www.opengis.net/def/crs/EPSG/0/7856'
              }
            ]
          }
        }
      };
      const configFile = join(directory, 'config.json'),
        openapiFile = join(directory, 'openapi.yml');
      await writeFile(configFile, JSON.stringify(config));
      await writeFile(
        openapiFile,
        'openapi: 3.0.2\ninfo:\n  title: S6 probe\n  version: 1.0.0\npaths: {}\n'
      );
      const child = spawn(
        python,
        [
          '-c',
          "from pygeoapi.flask_app import APP; import os; APP.run(host='127.0.0.1',port=int(os.environ['CII_SPIKE_PORT']),use_reloader=False)"
        ],
        {
          env: {
            ...process.env,
            PYGEOAPI_CONFIG: configFile,
            PYGEOAPI_OPENAPI: openapiFile,
            CII_SPIKE_PORT: String(backendPort)
          },
          stdio: ['ignore', 'pipe', 'pipe']
        }
      );
      let logs = '';
      child.stderr.on('data', (chunk) => {
        logs = (logs + chunk.toString()).slice(-12000);
      });
      let spawnError: Error | undefined;
      child.on('error', (error) => {
        spawnError = error;
      });
      const auth = { Authorization: 'Bearer spike-token' };
      try {
        let ready = false;
        for (let attempt = 0; attempt < 100; attempt++) {
          if (spawnError) throw spawnError;
          if (child.exitCode !== null)
            throw new Error(`pygeoapi exited: ${logs}`);
          try {
            const response = await fetch(
              `http://127.0.0.1:${backendPort}/collections`,
              { signal: AbortSignal.timeout(2000) }
            );
            if (response.ok) {
              ready = true;
              break;
            }
          } catch {
            /* backend may still be importing geospatial libraries */
          }
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        if (!ready) throw new Error(`pygeoapi not ready: ${logs}`);
        const feature = (id: number, coordinate: number[], name: string) => ({
          type: 'Feature',
          id,
          geometry: { type: 'Point', coordinates: coordinate },
          properties: { name }
        });
        const send = (
          body: unknown,
          crs: string,
          method = 'POST',
          path = '/collections/sites/items',
          extra: Record<string, string> = {}
        ) =>
          fetch(base + path, {
            method,
            headers: {
              ...auth,
              'Content-Type': 'application/geo+json',
              'Content-Crs': `<${crs}>`,
              ...extra
            },
            body: JSON.stringify(body)
          });
        const unauthorised = await fetch(base + '/collections/sites/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/geo+json' },
          body: JSON.stringify(feature(99, [1, 1], 'blocked'))
        });
        assert.equal(unauthorised.status, 401);
        const native = await send(
          feature(1, [334435.70614098536, 6250816.397908207], 'native'),
          'http://www.opengis.net/def/crs/EPSG/0/7856'
        );
        if (native.status !== 201)
          throw new Error(
            `Native POST failed: ${native.status} ${await native.text()} ${logs}`
          );
        const declared = await send(
          feature(2, [151.21, -33.87], 'crs84'),
          'http://www.opengis.net/def/crs/OGC/1.3/CRS84'
        );
        const read = await fetch(base + '/collections/sites/items/1', {
          headers: auth
        });
        const update = await send(
          feature(1, [334435.70614098536, 6250816.397908207], 'stale-update'),
          'http://www.opengis.net/def/crs/EPSG/0/7856',
          'PUT',
          '/collections/sites/items/1',
          { 'If-Match': '"deliberately-stale"' }
        );
        const rows = JSON.parse(
          await query(
            "SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'srid',ST_SRID(geom),'coordinate',jsonb_build_array(ST_X(geom),ST_Y(geom))) ORDER BY id) FROM spike_sites;"
          )
        ) as { id: number; name: string; coordinate: number[] }[];
        const contentCrsHonoured =
          declared.status === 201 &&
          Math.abs(
            rows.find((row) => row.id === 2)!.coordinate[0] - 334435.70614098536
          ) < 0.001;
        const etagEnforced = update.status === 412;
        const versions = (
          await promisify(execFile)(python, [
            '-c',
            "import importlib.metadata as m,json; print(json.dumps({p:m.version(p) for p in ['pygeoapi','psycopg2-binary','geoalchemy2','pyproj']}))"
          ])
        ).stdout.trim();
        const report = {
          measuredAt: new Date().toISOString(),
          versions: JSON.parse(versions),
          postgis: await query('SELECT PostGIS_Full_Version();'),
          unauthorisedStatus: unauthorised.status,
          nativePostStatus: native.status,
          crs84PostStatus: declared.status,
          getStatus: read.status,
          etag: read.headers.get('etag'),
          staleUpdateStatus: update.status,
          contentCrsHonoured,
          etagEnforced,
          rows,
          limits:
            'Disposable pygeoapi/PostGIS behind a local HTTP bearer-token proxy. This measures the pinned server/provider combination, not all OAPIF deployments or production authentication.'
        };
        await writeFile(
          new URL('../tests/fixtures/oapif-probe.json', import.meta.url),
          JSON.stringify(report, null, 2) + '\n'
        );
        console.log(JSON.stringify(report));
      } finally {
        child.kill('SIGTERM');
        await close(proxy);
      }
    },
    { publishLoopback: true }
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
