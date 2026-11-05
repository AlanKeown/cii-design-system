import { MapError } from '@cii/maps';
import type { Coord } from '@cii/maps';

/** Executes a supplied SELECT and returns its single JSON value. The adapter owns authentication/read-only transactions. */
export type AuditQuery = (sql: string) => Promise<unknown>;
export const AUSTRALIAN_TRANSFORM_GRIDS = [
  'au_icsm_GDA94_GDA2020_conformal.tif',
  'au_icsm_GDA94_GDA2020_conformal_and_distortion.tif'
] as const;
export type AustralianTransformGrid =
  (typeof AUSTRALIAN_TRANSFORM_GRIDS)[number];
export interface CrsAuthority {
  srid: number;
  authority: string | null;
  authorityCode: number | null;
}
export interface PostgisInspection {
  postgresVersion: string;
  readOnly: true;
  schema: string | null;
  version: string | null;
  fullVersion: string | null;
  projVersion: string | null;
  hasTransform: boolean;
  hasTransformPipeline: boolean;
  crsAuthorities: readonly CrsAuthority[];
}
export interface GridProbe {
  grid: AustralianTransformGrid;
  input: Coord;
  control: boolean;
  method: 'pipeline' | 'definitions' | null;
  status: 'usable' | 'failed' | 'unsupported';
  output?: Coord;
  sqlState?: string;
  projErrorCode?: number;
  /** Never infer physical file installation from a failed operation. */
  physicalGridInstallation: 'unknown';
}
export type TargetTransformRequirement =
  | { kind: 'automatic' }
  | { kind: 'explicit-pipeline' }
  | { kind: 'named-grid'; grid: AustralianTransformGrid };
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const invalid = () => new MapError('TARGET_AUDIT_INVALID');
export const quoteSqlIdentifier = (identifier: string): string => {
  if (
    typeof identifier !== 'string' ||
    !identifier ||
    identifier.includes('\0')
  )
    throw invalid();
  return `"${identifier.replaceAll('"', '""')}"`;
};
const literal = (value: string) =>
  `E'${value.replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
export function postgisFunction(
  inspection: PostgisInspection,
  name:
    | 'st_transform'
    | 'st_transformpipeline'
    | 'st_setsrid'
    | 'st_makepoint'
    | 'st_x'
    | 'st_y'
    | 'st_asgeojson'
): string {
  if (
    ![
      'st_transform',
      'st_transformpipeline',
      'st_setsrid',
      'st_makepoint',
      'st_x',
      'st_y',
      'st_asgeojson'
    ].includes(name)
  )
    throw invalid();
  if (!inspection.schema)
    throw new MapError('TARGET_CAPABILITY_UNSUPPORTED', {
      requirement: 'postgis'
    });
  return `${quoteSqlIdentifier(inspection.schema)}.${name}`;
}

/** Inspects system/extension metadata only. Never changes search_path or enables extensions. */
export async function inspectPostgisTarget(
  query: AuditQuery,
  srids: readonly number[]
): Promise<PostgisInspection> {
  if (srids.some((srid) => !Number.isSafeInteger(srid) || srid <= 0))
    throw invalid();
  const basic = await query(`SELECT jsonb_build_object(
    'postgresVersion',current_setting('server_version'),
    'readOnly',current_setting('transaction_read_only') = 'on',
    'extension',(SELECT jsonb_build_object('schema',n.nspname,'version',e.extversion)
      FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='postgis')) AS audit;`);
  if (
    !record(basic) ||
    typeof basic.postgresVersion !== 'string' ||
    basic.readOnly !== true
  )
    throw invalid();
  const result: PostgisInspection = {
    postgresVersion: basic.postgresVersion,
    readOnly: true,
    schema: null,
    version: null,
    fullVersion: null,
    projVersion: null,
    hasTransform: false,
    hasTransformPipeline: false,
    crsAuthorities: []
  };
  if (basic.extension === null) return result;
  if (
    !record(basic.extension) ||
    typeof basic.extension.schema !== 'string' ||
    typeof basic.extension.version !== 'string'
  )
    throw invalid();
  result.schema = basic.extension.schema;
  result.version = basic.extension.version;
  const schema = quoteSqlIdentifier(result.schema);
  const metadata = await query(`SELECT jsonb_build_object(
    'fullVersion',${schema}.postgis_full_version(),
    'hasTransform',EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=${literal(result.schema)} AND p.proname='st_transform' AND p.pronargs=2),
    'hasTransformPipeline',EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=${literal(result.schema)} AND p.proname='st_transformpipeline' AND p.pronargs=3),
    'crsAuthorities',COALESCE((SELECT jsonb_agg(jsonb_build_object('srid',srid,'authority',auth_name,'authorityCode',auth_srid) ORDER BY srid)
      FROM ${schema}.spatial_ref_sys WHERE srid = ANY(ARRAY[${[...new Set(srids)].join(',')}]::integer[])), '[]'::jsonb)) AS audit;`);
  if (
    !record(metadata) ||
    typeof metadata.fullVersion !== 'string' ||
    typeof metadata.hasTransform !== 'boolean' ||
    typeof metadata.hasTransformPipeline !== 'boolean' ||
    !Array.isArray(metadata.crsAuthorities)
  )
    throw invalid();
  const authorities: CrsAuthority[] = metadata.crsAuthorities.map((value) => {
    if (
      !record(value) ||
      typeof value.srid !== 'number' ||
      !Number.isSafeInteger(value.srid) ||
      !(value.authority === null || typeof value.authority === 'string') ||
      !(
        value.authorityCode === null ||
        (typeof value.authorityCode === 'number' &&
          Number.isSafeInteger(value.authorityCode))
      )
    )
      throw invalid();
    return {
      srid: value.srid,
      authority: value.authority,
      authorityCode: value.authorityCode
    };
  });
  return {
    ...result,
    fullVersion: metadata.fullVersion,
    projVersion:
      metadata.fullVersion.match(/\bPROJ="([^"\s]+)(?:\s[^"]*)?"/)?.[1] ?? null,
    hasTransform: metadata.hasTransform,
    hasTransformPipeline: metadata.hasTransformPipeline,
    crsAuthorities: authorities
  };
}

/** Availability preflight only. Does not certify accuracy, coverage, epochs, arbitrary pipelines, or authorise a write. */
export function assertTargetTransformation(
  inspection: PostgisInspection,
  grids: readonly GridProbe[],
  requirement: TargetTransformRequirement
): void {
  const supported =
    inspection.schema !== null &&
    inspection.hasTransform &&
    (requirement.kind === 'automatic' ||
      (requirement.kind === 'explicit-pipeline' &&
        inspection.hasTransformPipeline) ||
      (requirement.kind === 'named-grid' &&
        grids.some(
          (probe) =>
            probe.grid === requirement.grid &&
            probe.control === false &&
            probe.status === 'usable'
        )));
  if (!supported)
    throw new MapError('TARGET_CAPABILITY_UNSUPPORTED', { requirement });
}
export function auditSqlState(error: unknown): string | undefined {
  if (!record(error) && !(error instanceof Error)) return undefined;
  const state = 'sqlState' in error ? error.sqlState : undefined;
  if (typeof state === 'string' && /^[A-Z0-9]{5}$/.test(state)) return state;
  const stderr =
    'stderr' in error && typeof error.stderr === 'string'
      ? error.stderr
      : error.message;
  return typeof stderr === 'string'
    ? stderr.match(/ERROR:\s+([A-Z0-9]{5}):?/)?.[1]
    : undefined;
}

/** Uses the exact pipeline when available; older targets get a separately-labelled definition probe. */
export async function probeAustralianGrid(
  query: AuditQuery,
  inspection: PostgisInspection,
  grid: AustralianTransformGrid,
  options: { nullControl?: boolean } = {}
): Promise<GridProbe> {
  if (!(AUSTRALIAN_TRANSFORM_GRIDS as readonly string[]).includes(grid))
    throw invalid();
  const result: GridProbe = {
    grid,
    input: [151.21, -33.87],
    control: options.nullControl === true,
    method: inspection.hasTransformPipeline ? 'pipeline' : 'definitions',
    status: 'unsupported',
    physicalGridInstallation: 'unknown'
  };
  if (!inspection.schema || !inspection.hasTransform)
    return { ...result, method: null };
  const name = options.nullControl ? 'null' : grid;
  const fn = (name: Parameters<typeof postgisFunction>[1]) =>
    postgisFunction(inspection, name);
  const point = `${fn('st_setsrid')}(${fn('st_makepoint')}(151.21,-33.87),4283)`;
  const operation = inspection.hasTransformPipeline
    ? `${fn('st_transformpipeline')}(${point},${literal(`+proj=pipeline +step +proj=unitconvert +xy_in=deg +xy_out=rad +step +proj=hgridshift +grids=${name} +step +proj=unitconvert +xy_in=rad +xy_out=deg`)},7844)`
    : `${fn('st_transform')}(${point},${literal(`+proj=longlat +ellps=GRS80 +towgs84=0,0,0 +nadgrids=${name} +no_defs`)},'+proj=longlat +ellps=GRS80 +towgs84=0,0,0 +no_defs')`;
  try {
    const output = await query(
      `WITH result AS (SELECT ${operation} AS geom) SELECT jsonb_build_array(${fn('st_x')}(geom),${fn('st_y')}(geom)) AS audit FROM result;`
    );
    if (
      !Array.isArray(output) ||
      output.length !== 2 ||
      !output.every(
        (value) => typeof value === 'number' && Number.isFinite(value)
      )
    )
      throw invalid();
    return { ...result, status: 'usable', output: [output[0], output[1]] };
  } catch (error) {
    if (error instanceof MapError) throw error;
    const message = error instanceof Error ? error.message : '';
    if (!auditSqlState(error) && !message.includes('ERROR:')) throw error;
    return {
      ...result,
      status: 'failed',
      sqlState: auditSqlState(error),
      projErrorCode: Number(message.match(/\((\d+)\)/)?.[1]) || undefined
    };
  }
}
