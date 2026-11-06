import type { SourceInput } from '../crs/resolve.js';
import type { ConfirmedCrs, CrsDeclaration } from '../crs/types.js';

export interface CrsConfirmation<T extends SourceInput = SourceInput> {
  source: T & { crs: CrsDeclaration };
  confirmed: ConfirmedCrs;
}
