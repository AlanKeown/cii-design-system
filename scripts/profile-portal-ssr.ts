import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Profile the production server without network waits or development transforms.
// Node CPU measurements compare local builds; they are not Cloudflare CPU metrics.
const root = fileURLToPath(new URL('../', import.meta.url));
const entry = pathToFileURL(
  resolve(root, 'apps/community-portal/.svelte-kit/cloudflare-tmp/server.js')
).href;
const instrument = process.argv.includes('--instrument');
const measurements = new Map<
  string,
  { calls: number; cpuMicroseconds: number }
>();

function measure<T>(name: string, operation: () => T): T {
  const before = process.cpuUsage();
  try {
    return operation();
  } finally {
    const cpu = process.cpuUsage(before);
    const result = measurements.get(name) ?? { calls: 0, cpuMicroseconds: 0 };
    result.calls++;
    result.cpuMicroseconds += cpu.user + cpu.system;
    measurements.set(name, result);
  }
}

if (instrument) {
  for (const name of ['DateTimeFormat', 'NumberFormat'] as const) {
    const constructor = Intl[name];
    Object.defineProperty(Intl, name, {
      configurable: true,
      writable: true,
      value: new Proxy(constructor, {
        construct(target, args, newTarget) {
          return measure(`Intl.${name} construction`, () =>
            Reflect.construct(target, args, newTarget)
          );
        }
      })
    });
  }
  const original = Date.prototype.toLocaleDateString;
  Date.prototype.toLocaleDateString = function (
    ...args: Parameters<Date['toLocaleDateString']>
  ): string {
    return measure('Date.toLocaleDateString', () => original.apply(this, args));
  };
}

const {
  server
}: {
  server: {
    init(options: { env: Record<string, string> }): Promise<void>;
    respond(
      request: Request,
      options: { getClientAddress: () => string }
    ): Promise<Response>;
  };
} = await import(entry);
await server.init({ env: {} });

async function render(): Promise<void> {
  const response = await server.respond(
    new Request('https://profile.example/'),
    {
      getClientAddress: () => '127.0.0.1'
    }
  );
  if (response.status !== 200)
    throw new Error(`SSR returned ${response.status}`);
  const html = await response.text();
  if (!html.includes('Good morning, Sarah'))
    throw new Error('Dashboard was not server-rendered');
}

const first = process.cpuUsage();
await render();
const initial = process.cpuUsage(first);
for (let index = 0; index < 20; index++) await render();
measurements.clear();
const samples: number[] = [];
for (let index = 0; index < 100; index++) {
  const before = process.cpuUsage();
  await render();
  const cpu = process.cpuUsage(before);
  samples.push((cpu.user + cpu.system) / 1000);
}
samples.sort((a, b) => a - b);
const percentile = (p: number): number =>
  samples[Math.ceil(samples.length * p) - 1]!;
console.log(
  JSON.stringify(
    {
      runtime: process.version,
      instrumented: instrument,
      initialRenderCpuMs: (initial.user + initial.system) / 1000,
      warmupRequests: 20,
      measuredRequests: samples.length,
      cpuMs: {
        p50: percentile(0.5),
        p95: percentile(0.95),
        p99: percentile(0.99)
      },
      instrumentation: Object.fromEntries(measurements)
    },
    null,
    2
  )
);
