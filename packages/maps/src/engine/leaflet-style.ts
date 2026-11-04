import { MapError } from '../errors.ts';
import type { PortableStyle } from './types.ts';

export function assertLeafletStyle(style?: PortableStyle): void {
  if (
    style?.rules ||
    style?.label ||
    (style?.point &&
      ('icon' in style.point || style.point.shape !== 'circle')) ||
    Object.keys(style ?? {}).some((key) => key.startsWith('x-'))
  )
    throw new MapError('STYLE_UNSUPPORTED', {
      reason:
        'This slice supports base paths and circle points; labels, rules, icons and native passthrough are not yet implemented.'
    });
}
