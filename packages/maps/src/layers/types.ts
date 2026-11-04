import type { SourceSpec } from '../crs/resolve.ts';
import type { CrsDef, TileMatrix } from '../crs/types.ts';
import type {
  EngineCapabilities,
  EngineId,
  LayerHandle,
  PortableStyle,
  RenderKind
} from '../engine/types.ts';

export type SourceSpatialSupport =
  | { type: 'features' }
  | { type: 'fixed-grid'; crs: string; grid: TileMatrix }
  | { type: 'service'; supportedCrs: readonly string[] }
  | { type: 'image' }
  | { type: 'custom'; supportedCrs: readonly string[] };

/** A probed/opened source; file/service readers own the immutable input data. */
export interface ResolvedSource extends SourceSpec {
  /** Stable provider-defined identity including URL, sub-layer and relevant request options. */
  identity: string;
  renderKind: RenderKind;
  data: unknown;
  spatial: SourceSpatialSupport;
  /** URL-backed sources must say true, including URLs relative to the app. */
  remote: boolean;
}

export interface LayerSpec {
  id: string;
  source: ResolvedSource;
  visible?: boolean;
  opacity?: number;
  order?: number;
  style?: PortableStyle;
  attribution?: string;
}

export interface RendererContext {
  engineId: EngineId;
  capabilities: EngineCapabilities;
  displayCrs: CrsDef;
  signal: AbortSignal;
}

export interface PreparedLayer {
  data: unknown;
  /** Released on removal, replacement, detach, failure or a late aborted result. */
  dispose?(): void;
}

export interface LayerRenderer {
  /** Return an incompatibility reason, or undefined when preparation is supported. */
  compatibility(
    source: ResolvedSource,
    context: Omit<RendererContext, 'signal'>
  ): string | undefined;
  /** Transform/request data for the display CRS. Never mutate the source coordinates. */
  prepare(
    source: ResolvedSource,
    context: RendererContext
  ): PreparedLayer | Promise<PreparedLayer>;
}

export type LayerStatus = 'queued' | 'loading' | 'ready' | 'error' | 'removed';
export interface ManagedLayer extends Omit<LayerHandle, 'setData'> {
  readonly id: string;
  readonly status: LayerStatus;
  /** New promise after a reload/reattach; rejects on error/removal. */
  readonly ready: Promise<void>;
  readonly spec: LayerSpec;
  update(next: LayerSpec): void;
  reload(): void;
}
