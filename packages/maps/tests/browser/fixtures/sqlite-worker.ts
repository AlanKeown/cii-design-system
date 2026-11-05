import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import initSqlJs from 'sql.js';
import sqlWasm from 'sql.js/dist/sql-wasm.wasm?url';

export type SqliteMode = 'sqlite-memory' | 'sqlite-opfs' | 'sqljs';
export interface SqliteBenchmark {
  mode: SqliteMode;
  bytes: number;
  elapsedMs: number;
  heapBytes: number | null;
  inputBufferBytes: number;
  count: number;
  srid: number;
  opfs: boolean;
}
declare const self: {
  onmessage:
    ((event: MessageEvent<{ mode: SqliteMode; url: string }>) => void) | null;
  postMessage(value: SqliteBenchmark | { error: string }): void;
};
self.onmessage = async ({ data: { mode, url } }) => {
  try {
    const started = performance.now();
    const response = await fetch(url);
    if (!response.ok) throw new Error('Fixture unavailable.');
    const bytes = Number(response.headers.get('content-length'));
    let inputBufferBytes = 0,
      heapBytes: number | null = null,
      count = 0,
      srid = 0;
    if (mode === 'sqljs') {
      const SQL = await initSqlJs({ locateFile: () => sqlWasm });
      const input = new Uint8Array(await response.arrayBuffer());
      inputBufferBytes = input.byteLength;
      const db = new SQL.Database(input);
      try {
        count = Number(db.exec('SELECT COUNT(*) FROM sites')[0].values[0][0]);
        srid = Number(
          db.exec('SELECT srs_id FROM gpkg_geometry_columns')[0].values[0][0]
        );
        const heap: unknown = Reflect.get(SQL, 'HEAPU8');
        if (heap instanceof Uint8Array) heapBytes = heap.buffer.byteLength;
      } finally {
        db.close();
      }
    } else {
      const sqlite = await sqlite3InitModule();
      if (mode === 'sqlite-opfs') {
        if (!sqlite.oo1.OpfsDb) throw new Error('OPFS unavailable.');
        const filename = `/cii-spike-${crypto.randomUUID()}.gpkg`;
        const reader = response.body!.getReader();
        try {
          await sqlite.oo1.OpfsDb.importDb(filename, async () => {
            const chunk = await reader.read();
            inputBufferBytes = Math.max(
              inputBufferBytes,
              chunk.value?.byteLength ?? 0
            );
            return chunk.value;
          });
          const db = new sqlite.oo1.OpfsDb(filename, 'r');
          try {
            count = Number(db.selectValue('SELECT COUNT(*) FROM sites'));
            srid = Number(
              db.selectValue('SELECT srs_id FROM gpkg_geometry_columns')
            );
            heapBytes = sqlite.wasm.heap8u().buffer.byteLength;
          } finally {
            db.close();
          }
        } finally {
          reader.releaseLock();
          await (
            await navigator.storage.getDirectory()
          ).removeEntry(filename.slice(1));
        }
      } else {
        const input = new Uint8Array(await response.arrayBuffer());
        inputBufferBytes = input.byteLength;
        const db = new sqlite.oo1.DB(':memory:');
        const pointer = sqlite.wasm.allocFromTypedArray(input);
        try {
          const code = sqlite.capi.sqlite3_deserialize(
            db.pointer!,
            'main',
            pointer,
            input.length,
            input.length,
            sqlite.capi.SQLITE_DESERIALIZE_READONLY
          );
          if (code !== sqlite.capi.SQLITE_OK)
            throw new Error(`Deserialize failed: ${code}`);
          count = Number(db.selectValue('SELECT COUNT(*) FROM sites'));
          srid = Number(
            db.selectValue('SELECT srs_id FROM gpkg_geometry_columns')
          );
          heapBytes = sqlite.wasm.heap8u().buffer.byteLength;
        } finally {
          db.close();
          sqlite.wasm.dealloc(pointer);
        }
      }
    }
    self.postMessage({
      mode,
      bytes,
      elapsedMs: performance.now() - started,
      heapBytes,
      inputBufferBytes,
      count,
      srid,
      opfs: mode === 'sqlite-opfs'
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error)
    });
  }
};
