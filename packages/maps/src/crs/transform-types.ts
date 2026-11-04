import type { Coord, GeodeticDatum } from './types.ts';
import type { FeatureBatch, Geometry, Position } from '../engine/types.ts';

export interface TransformRequest {
  source: string;
  target: string;
  sourceEpoch?: number;
  targetEpoch?: number;
  /** Conservative opt-in policy for consumers that cannot accept an unverified datum crossing. */
  datumPolicy?: 'allow-display' | 'require-same-datum';
}

export type TransformWarningCode =
  'DATUM_DIFFERENCE' | 'DATUM_UNKNOWN' | 'DATUM_ENSEMBLE' | 'EPOCH_NOT_APPLIED';
export interface TransformWarning {
  code: TransformWarningCode;
  message: string;
}

export interface TransformAccuracy {
  tier: 'display';
  authoritative: false;
  dimensions: 'horizontal-only';
  operation: 'identity' | 'projection' | 'definition-transform';
  source: { code: string; epoch?: number; datum?: GeodeticDatum };
  target: { code: string; epoch?: number; datum?: GeodeticDatum };
  datumRelationship: 'same' | 'different' | 'unknown';
  /** No vetted operation accuracy or input survey accuracy is inferred from projection maths. */
  horizontalAccuracyMetres: null;
  warnings: readonly TransformWarning[];
}

/** Inputs/outputs are core x/y; source-provider axis swaps have already happened. */
export interface PreparedTransform {
  readonly accuracy: TransformAccuracy;
  coordinate(coordinate: Coord): Coord;
  /** Additional ordinates are copied unchanged, never vertically transformed. */
  position(position: Position): Position;
  geometry(geometry: Geometry): Geometry;
  /** Geometry is copied; immutable attribute objects are shared. */
  features(batch: FeatureBatch): FeatureBatch;
}
