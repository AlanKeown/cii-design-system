import initSqlJs from 'sql.js';
import { mkdir, writeFile } from 'node:fs/promises';

const SQL = await initSqlJs();
const destination = new URL(
  '../tests/browser/fixtures/generated/',
  import.meta.url
);
await mkdir(destination, { recursive: true });
for (const mib of [1, 16, 64, 128]) {
  const db = new SQL.Database();
  try {
    db.run(`PRAGMA application_id=1196444487;
      PRAGMA user_version=10300;
      CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT NOT NULL,srs_id INTEGER PRIMARY KEY,organization TEXT NOT NULL,organization_coordsys_id INTEGER NOT NULL,definition TEXT NOT NULL,description TEXT);
      INSERT INTO gpkg_spatial_ref_sys VALUES ('Undefined Cartesian',-1,'NONE',-1,'undefined',NULL),('Undefined geographic',0,'NONE',0,'undefined',NULL),('WGS 84',4326,'EPSG',4326,'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433],AUTHORITY["EPSG","4326"]]',NULL);
      CREATE TABLE gpkg_contents (table_name TEXT PRIMARY KEY,data_type TEXT NOT NULL,identifier TEXT UNIQUE,description TEXT DEFAULT '',last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),min_x DOUBLE,min_y DOUBLE,max_x DOUBLE,max_y DOUBLE,srs_id INTEGER);
      CREATE TABLE gpkg_geometry_columns (table_name TEXT NOT NULL,column_name TEXT NOT NULL,geometry_type_name TEXT NOT NULL,srs_id INTEGER NOT NULL,z TINYINT NOT NULL,m TINYINT NOT NULL,PRIMARY KEY(table_name,column_name));
      CREATE TABLE sites (id INTEGER PRIMARY KEY,geom BLOB NOT NULL);
      INSERT INTO gpkg_geometry_columns VALUES ('sites','geom','POINT',4326,0,0);
      INSERT INTO gpkg_contents(table_name,data_type,identifier,srs_id) VALUES ('sites','features','sites',4326);
      CREATE TABLE padding (data BLOB);`);
    const point = Buffer.alloc(29);
    point.write('GP');
    point[2] = 0;
    point[3] = 1;
    point.writeInt32LE(4326, 4);
    point[8] = 1;
    point.writeUInt32LE(1, 9);
    point.writeDoubleLE(151.21, 13);
    point.writeDoubleLE(-33.87, 21);
    db.run('BEGIN');
    const statement = db.prepare('INSERT INTO sites(geom) VALUES (?)');
    try {
      for (let index = 0; index < 1000; index++) statement.run([point]);
    } finally {
      statement.free();
    }
    db.run('COMMIT');
    db.run('INSERT INTO padding VALUES (zeroblob(?))', [
      mib * 1024 * 1024 - 128 * 1024
    ]);
    const bytes = db.export();
    await writeFile(new URL(`sqlite-${mib}.gpkg`, destination), bytes);
    console.log(JSON.stringify({ mib, bytes: bytes.byteLength }));
  } finally {
    db.close();
  }
}
