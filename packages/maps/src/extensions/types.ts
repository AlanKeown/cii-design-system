import type { Component } from 'svelte';
import type { Coord, CrsCode, Extent } from '../crs/types.ts';
import type {
  Geometry,
  FeatureBatch,
  MapFeature,
  MapPointerEvent,
  PortableStyle
} from '../engine/types.ts';

export interface ControlRegistration {
  component: Component<{ config: Readonly<Record<string, unknown>> }>;
  /** Draft-07 schema for the control's own options, merged by config/extensions. */
  configSchema?: Readonly<Record<string, unknown>>;
}

export interface ValidationIssue {
  code: string;
  message: string;
  path?: readonly (string | number)[];
}

export interface TargetRef {
  schema: string;
  table: string;
}
export type PrimaryKey = Readonly<Record<string, string | number>>;
export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  writable: boolean;
  enumValues?: readonly (string | number)[];
  maxLength?: number;
}
export interface TargetDescriptor {
  pk: readonly string[];
  geometryColumn: string;
  geometryType: string;
  srid: number;
  dimensions: number;
  columns: readonly ColumnInfo[];
  versionColumn?: string;
  writable: boolean;
}
export type GeometryValidator = (
  geometry: Geometry,
  properties: Readonly<Record<string, unknown>>,
  descriptor: TargetDescriptor
) => readonly ValidationIssue[];

/** Coordinates belong to the named CRS; stored paths follow GeoJSON coordinate nesting. */
export type VertexSource =
  | { kind: 'freehand' }
  | { kind: 'stored'; path: readonly number[] }
  | {
      kind: 'snapped';
      layer: string;
      identity?: { pk: PrimaryKey; version?: string };
      crs: CrsCode;
      coordinate: Coord;
    };

interface GeometryOperation {
  geometryCrs: CrsCode;
  geometry: Geometry;
  vertexSources?: readonly VertexSource[];
}
export interface InsertOperation extends GeometryOperation {
  opId: string;
  tempId: string;
  properties: Readonly<Record<string, unknown>>;
}
export type UpdateOperation = {
  opId: string;
  pk: PrimaryKey;
  baseVersion?: string;
  properties?: Readonly<Record<string, unknown>>;
} & (
  | GeometryOperation
  | { geometryCrs?: never; geometry?: never; vertexSources?: never }
);
export interface ChangeSet {
  target: TargetRef;
  clientRequestId: string;
  returnCrs: CrsCode;
  inserts: readonly InsertOperation[];
  updates: readonly UpdateOperation[];
  deletes: readonly { opId: string; pk: PrimaryKey; baseVersion?: string }[];
  context?: { captureContext?: Readonly<Record<string, unknown>> };
}
interface ReturnedRow extends GeometryOperation {
  pk: PrimaryKey;
  version?: string;
  properties: Readonly<Record<string, unknown>>;
}
export type OperationResult =
  | ({ opId: string; outcome: 'inserted'; tempId: string } & ReturnedRow)
  | ({ opId: string; outcome: 'updated' } & ReturnedRow)
  | { opId: string; outcome: 'deleted'; pk: PrimaryKey }
  | { opId: string; outcome: 'conflict'; pk: PrimaryKey; serverVersion: string }
  | {
      opId: string;
      outcome: 'rejected';
      code: string;
      message: string;
      retryable: boolean;
    }
  | { opId: string; outcome: 'not-attempted' };
export interface CommitResult {
  status: 'committed' | 'partial' | 'conflict' | 'rejected';
  results: readonly OperationResult[];
}
export interface PersistenceAdapter {
  describeTarget(target: TargetRef): Promise<TargetDescriptor>;
  read?(
    target: TargetRef,
    query: { bbox?: Extent; crs: CrsCode; limit?: number; cursor?: string }
  ): Promise<{ features: readonly MapFeature[]; next?: string }>;
  commit(
    changeSet: ChangeSet,
    options: { signal: AbortSignal }
  ): Promise<CommitResult>;
  capabilities: {
    atomicMultiFeature: boolean;
    optimisticConcurrency: 'version-column' | 'etag' | 'none';
    authoritativeTransform: boolean;
    targetIntrospection: 'database' | 'declared';
    idempotentRetry: boolean;
  };
}
export function isConformantPersistence(adapter: PersistenceAdapter): boolean {
  const capabilities = adapter.capabilities;
  return (
    capabilities.authoritativeTransform &&
    capabilities.targetIntrospection === 'database' &&
    capabilities.optimisticConcurrency !== 'none'
  );
}

export interface CaptureState {
  status: 'armed' | 'sketching' | 'complete' | 'cancelled';
  sketch: FeatureBatch;
  geometry?: Geometry;
}
/** Factories provide a fresh state machine for every capture session. */
export interface CaptureMode {
  create(context: { crs: CrsCode }): {
    pointer(event: MapPointerEvent): CaptureState;
    key(event: KeyboardEvent): CaptureState;
    cancel(): CaptureState;
  };
}
export type FeatureExporter = (
  features: FeatureBatch,
  crs: CrsCode,
  options: { signal?: AbortSignal }
) => Blob | Promise<Blob>;
export type StyleCompiler = (style: PortableStyle) => unknown;
