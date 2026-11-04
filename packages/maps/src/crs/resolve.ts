import { MapError } from '../errors.ts';
import type { Result } from '../errors.ts';
import type { Registry } from '../registry.ts';
import type { CrsRegistry } from './registry.ts';
import type {
  ConfirmedCrs,
  CrsDeclaration,
  CrsHint,
  CrsProvenance,
  CrsRef
} from './types.ts';

export interface SourceConfig {
  provider: string;
  crs?: CrsDeclaration;
  [option: string]: unknown;
}

export interface SourceSpec extends Omit<SourceConfig, 'crs'> {
  provider: string;
  crs: ConfirmedCrs;
}

export type ProbeResult =
  | { kind: 'hint'; hint?: CrsHint }
  | {
      kind: 'metadata';
      candidates: readonly {
        crs: CrsRef;
        provenance: Exclude<CrsProvenance, { kind: 'declared' }>;
      }[];
      nativeCode?: string;
    };

export interface SourceProvider {
  /** File/inline/tile conventions must use declared, never metadata. */
  crsMode: 'declared' | 'service-metadata' | 'database-metadata';
  probe(source: SourceConfig, context: ProbeContext): Promise<ProbeResult>;
}

export interface ProbeContext {
  crsRegistry: CrsRegistry;
  sources: Registry<SourceProvider>;
  displayCrs: string;
  /** Organisation policy for database sources; services still use metadata. */
  requireDeclaration?: boolean;
  acknowledgeHintMismatch?: boolean;
  /** Used when a WKT-only hint cannot be compared by its code. */
  hintMatches?: (hint: CrsHint, declaredCode: string) => Promise<boolean>;
  now?: () => Date;
}

/** Probe first, then confirm. Provider/network exceptions remain source errors. */
export async function resolveSourceCrs(
  source: SourceConfig,
  ctx: ProbeContext
): Promise<Result<ConfirmedCrs>> {
  try {
    const provider = ctx.sources.require(source.provider);
    const probe = await provider.probe(source, ctx);
    const declaration = source.crs;
    const needsDeclaration =
      provider.crsMode === 'declared' ||
      (provider.crsMode === 'database-metadata' &&
        (ctx.requireDeclaration || probe.kind === 'hint'));
    let crs: CrsRef;
    let provenance: CrsProvenance;

    if (needsDeclaration) {
      if (
        !declaration ||
        !('code' in declaration) ||
        !declaration.provenance.by.trim()
      ) {
        throw new MapError('CRS_NOT_CONFIRMED', { provider: source.provider });
      }
      // Database metadata also remains a hint when declaration is forced by policy.
      const hint: CrsHint | undefined =
        probe.kind === 'hint'
          ? probe.hint
          : {
              code: probe.nativeCode ?? probe.candidates[0]?.crs.code,
              from: 'none'
            };
      let mismatch = false;
      if (hint?.code) mismatch = hint.code !== declaration.code;
      else if (hint?.wkt)
        mismatch = !(await ctx.hintMatches?.(hint, declaration.code));
      if (mismatch && !ctx.acknowledgeHintMismatch) {
        throw new MapError('CRS_HINT_MISMATCH', {
          declared: declaration.code,
          hint
        });
      }
      crs = {
        code: declaration.code,
        axisOrder: declaration.axisOrder ?? 'xy'
      };
      provenance = {
        kind: 'declared',
        by: declaration.provenance.by,
        ...(hint ? { hint } : {}),
        ...(mismatch ? { hintMismatchAcknowledged: true } : {})
      };
    } else {
      if (declaration && 'code' in declaration) {
        throw new MapError('CRS_DECLARATION_NOT_ALLOWED', {
          provider: source.provider
        });
      }
      if (
        !declaration ||
        !('fromMetadata' in declaration) ||
        !declaration.fromMetadata
      ) {
        throw new MapError('CRS_NOT_CONFIRMED', { provider: source.provider });
      }
      if (probe.kind !== 'metadata' || !probe.candidates.length) {
        throw new MapError('CRS_METADATA_INVALID', {
          provider: source.provider
        });
      }
      const preferred =
        declaration.policy === 'prefer-display'
          ? ctx.displayCrs
          : probe.nativeCode;
      const selected =
        probe.candidates.find(
          (candidate) => candidate.crs.code === preferred
        ) ?? probe.candidates[0];
      if (
        selected.provenance.kind !== provider.crsMode ||
        (selected.provenance.kind === 'database-metadata' &&
          (!Number.isInteger(selected.provenance.srid) ||
            selected.provenance.srid <= 0 ||
            !selected.provenance.table.trim() ||
            !selected.provenance.column.trim())) ||
        (selected.provenance.kind === 'service-metadata' &&
          (!selected.provenance.url.trim() ||
            !selected.provenance.element.trim()))
      ) {
        throw new MapError('CRS_METADATA_INVALID', {
          provider: source.provider
        });
      }
      crs = selected.crs;
      provenance = selected.provenance;
    }
    if (crs.axisOrder !== 'xy' && crs.axisOrder !== 'yx') {
      throw new MapError('CRS_METADATA_INVALID', { crs });
    }
    await ctx.crsRegistry.resolve(crs.code);
    return {
      ok: true,
      value: structuredClone({
        crs,
        provenance,
        confirmedAt: (ctx.now?.() ?? new Date()).toISOString()
      })
    };
  } catch (error) {
    if (error instanceof MapError) return { ok: false, error };
    throw error;
  }
}

/** Source boundary helper: core coordinates are always x/y. */
export function toCoreCoord(
  coordinate: readonly [number, number],
  crs: CrsRef
): readonly [number, number] {
  return crs.axisOrder === 'yx'
    ? [coordinate[1], coordinate[0]]
    : [coordinate[0], coordinate[1]];
}
