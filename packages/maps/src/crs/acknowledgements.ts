import { MapError } from '../errors.ts';
import { isConfirmedCrs } from './confirmation.ts';
import type { SourceInput, ProbeContext } from './resolve.ts';
import type { ConfirmedCrs } from './types.ts';

type Evidence = NonNullable<ProbeContext['hintMismatchAcknowledgement']>;
/** JSON source identity independent of property ordering, shared across config copies. */
function sourceKey(source: SourceInput): string {
  const seen = new WeakSet<object>();
  const canonical = (value: unknown): unknown => {
    if (value && typeof value === 'object') {
      if (seen.has(value))
        throw new MapError('SOURCE_INVALID', {
          reason: 'Cyclic source input cannot be acknowledged.'
        });
      const prototype = Object.getPrototypeOf(value);
      if (
        !Array.isArray(value) &&
        prototype !== Object.prototype &&
        prototype !== null
      )
        throw new MapError('SOURCE_INVALID', {
          reason: 'Scoped mismatch acknowledgements require JSON source inputs.'
        });
      seen.add(value);
    }
    if (
      typeof value === 'function' ||
      typeof value === 'symbol' ||
      typeof value === 'bigint' ||
      (typeof value === 'number' && !Number.isFinite(value))
    )
      throw new MapError('SOURCE_INVALID', {
        reason: 'Scoped mismatch acknowledgements require JSON source inputs.'
      });
    if (Array.isArray(value)) {
      const result = value.map(canonical);
      seen.delete(value);
      return result;
    }
    if (value && typeof value === 'object') {
      const result = Object.fromEntries(
        Object.entries(value)
          .filter(([, item]) => item !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, canonical(item)])
      );
      seen.delete(value);
      return result;
    }
    return value;
  };
  return JSON.stringify(canonical(source));
}

/** Map/runtime-owned approvals, never a cross-layer or global mismatch bypass. */
export function createCrsAcknowledgements() {
  const entries = new Map<string, Evidence>();
  return {
    rememberConfirmation<T extends SourceInput>(
      source: T,
      confirmed: ConfirmedCrs
    ): void {
      if (
        !isConfirmedCrs(confirmed) ||
        !source.crs ||
        !('code' in source.crs) ||
        confirmed.provenance.kind !== 'declared' ||
        source.crs.code !== confirmed.crs.code ||
        (source.crs.axisOrder ?? 'xy') !== confirmed.crs.axisOrder ||
        source.crs.provenance.by !== confirmed.provenance.by
      )
        throw new MapError('CRS_NOT_CONFIRMED');
      const key = sourceKey(source);
      if (
        confirmed.provenance.hintMismatchAcknowledged &&
        confirmed.provenance.hint
      )
        entries.set(
          key,
          structuredClone({
            crs: confirmed.crs,
            hint: confirmed.provenance.hint
          })
        );
      else entries.delete(key);
    },
    acknowledgementFor<T extends SourceInput>(source: T): Evidence | undefined {
      const evidence = entries.get(sourceKey(source));
      return evidence ? structuredClone(evidence) : undefined;
    },
    forgetConfirmation<T extends SourceInput>(source: T): void {
      entries.delete(sourceKey(source));
    }
  };
}
