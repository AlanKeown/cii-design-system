import { MapError } from './errors.ts';
import type { CrsDef } from './crs/types.ts';
import type { IMapEngine } from './engine/types.ts';
import type { ViewState } from './view.ts';
import type { MapRuntime } from './map-controller.ts';

/** Preserve the live centre and local horizontal scale across a change of map units. */
export async function transformedDisplayView(
  engine: IMapEngine,
  previous: CrsDef,
  next: CrsDef,
  runtime: MapRuntime
): Promise<Pick<ViewState, 'center' | 'resolution' | 'rotation'>> {
  const transform = await runtime.transforms.prepare({
    source: previous.code,
    target: next.code
  });
  const geographic = await runtime.transforms.prepare({
    source: previous.code,
    target: 'EPSG:4326'
  });
  const view = engine.getView();
  if (
    next.code === 'EPSG:3857' &&
    Math.abs(geographic.coordinate(view.center)[1]) > 85.0511287798066
  )
    throw new MapError('DISPLAY_CRS_SWITCH_BLOCKED', {
      reason:
        'Current centre is outside the native Web Mercator latitude range.'
    });
  const center = transform.coordinate(view.center);
  const step = Math.min(
    view.resolution,
    previous.units === 'degrees' ? 0.00001 : 1
  );
  const lower = transform.coordinate([
    view.center[0] - step / 2,
    view.center[1]
  ]);
  const upper = transform.coordinate([
    view.center[0] + step / 2,
    view.center[1]
  ]);
  let dx = upper[0] - lower[0];
  const period =
    next.units === 'degrees'
      ? 360
      : next.code === 'EPSG:3857'
        ? 2 * Math.PI * 6378137
        : undefined;
  if (period) dx -= Math.round(dx / period) * period;
  const resolution =
    (Math.hypot(dx, upper[1] - lower[1]) / step) * view.resolution;
  if (
    !Number.isFinite(resolution) ||
    resolution <= 0 ||
    !center.every(Number.isFinite)
  )
    throw new MapError('DISPLAY_CRS_SWITCH_BLOCKED', {
      reason:
        'The current view cannot be represented in the requested display CRS.'
    });
  return { center, resolution, rotation: view.rotation };
}

export interface EngineHost {
  node: HTMLElement;
  activate(): void;
  dispose(): void;
}
/** Separate hosts permit a rollback without destroying or mutating the current map. */
export function createEngineHost(
  container: HTMLElement,
  staged = false
): EngineHost {
  if (!container.ownerDocument) {
    // Contract-only engine tests have no DOM; dimensions are still explicit.
    const node = {
      get clientWidth() {
        return container.clientWidth;
      },
      get clientHeight() {
        return container.clientHeight;
      }
    } as HTMLElement;
    return { node, activate() {}, dispose() {} };
  }
  const node = container.ownerDocument.createElement('div');
  node.dataset.mapHost = 'true';
  Object.assign(node.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%'
  });
  node.setAttribute('role', 'application');
  node.setAttribute(
    'aria-label',
    container.dataset.canvasLabel ?? 'Map canvas'
  );
  if (container.dataset.canvasDescription)
    node.setAttribute('aria-describedby', container.dataset.canvasDescription);
  node.tabIndex = -1;
  if (staged) {
    node.inert = true;
    node.style.visibility = 'hidden';
    node.setAttribute('aria-hidden', 'true');
  }
  container.append(node);
  return {
    node,
    activate() {
      node.inert = false;
      node.style.visibility = '';
      node.removeAttribute('aria-hidden');
    },
    dispose() {
      node.remove();
    }
  };
}

/** Stop waiting for an obsolete mount without blocking the next configuration. */
export async function waitForSwitch<T>(
  pending: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  signal.throwIfAborted();
  let abort!: () => void;
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
  });
  try {
    return await Promise.race([pending, cancelled]);
  } finally {
    signal.removeEventListener('abort', abort);
  }
}
