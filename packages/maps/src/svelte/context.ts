import { createContext } from 'svelte';
import { MapError } from '../errors.js';
import type { IMapEngine } from '../engine/types.js';
import type { LayerSpec, ManagedLayer } from '../layers/types.js';
import type { LayerManager } from '../layers/manager.js';

export interface MapContext {
  readonly engine: IMapEngine | null;
  readonly layers: LayerManager | null;
  readonly ready: boolean;
  readonly displayCrs: string | null;
  readonly switching: boolean;
  setDisplayCrs(code: string): Promise<void>;
  registerLayer(
    spec: LayerSpec,
    options?: { onerror?: (error: MapError) => void }
  ): ManagedLayer;
}
const [read, write] = createContext<MapContext>();
export const setMapContext = write;
export function getMapContext(): MapContext {
  try {
    return read();
  } catch {
    throw new MapError('MAP_CONTEXT_MISSING', {
      reason: 'Map controls must be inside MapContainer.'
    });
  }
}
