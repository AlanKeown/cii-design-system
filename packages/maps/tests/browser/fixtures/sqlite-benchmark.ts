import type { SqliteBenchmark, SqliteMode } from './sqlite-worker.ts';
declare global {
  interface Window {
    sqliteSpike?: (mode: SqliteMode, mib: number) => Promise<SqliteBenchmark>;
  }
}
window.sqliteSpike = (mode, mib) =>
  new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./sqlite-worker.ts', import.meta.url), {
      type: 'module'
    });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('Worker timed out.'));
    }, 60_000);
    worker.onerror = (event) => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error(event.message));
    };
    worker.onmessage = (
      event: MessageEvent<SqliteBenchmark | { error: string }>
    ) => {
      clearTimeout(timer);
      worker.terminate();
      if ('error' in event.data) reject(new Error(event.data.error));
      else resolve(event.data);
    };
    worker.postMessage({
      mode,
      url: new URL(`/generated/sqlite-${mib}.gpkg`, location.href).href
    });
  });
