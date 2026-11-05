import { assertDisplayCrs } from './engine/registry.ts';
import { MapError } from './errors.ts';
import { FakeViewEngine, checkViewConformance } from './testing-view.ts';
import type { Coord, CrsDef } from './crs/types.ts';
import type { ViewState } from './view.ts';
import type {
  EngineCapabilities,
  EngineEvents,
  EngineInit,
  FeatureBatch,
  FeatureHit,
  IMapEngine,
  InteractionSurface,
  LayerHandle,
  MapPointerEvent,
  NavigationGesture,
  Pixel,
  PortableStyle,
  ResolvedLayer,
  SketchRenderer
} from './engine/types.ts';

export interface FakeEngineOptions {
  capabilities?: Partial<Omit<EngineCapabilities, 'rotation'>>;
  beforeMount?: () => Promise<void>;
  reconfigure?: 'done' | 'rebuild-required';
}

/** Contract fake: deterministic data/interaction fixtures, with no browser or rendering dependency. */
export class FakeMapEngine implements IMapEngine {
  readonly id = 'fake';
  readonly capabilities: EngineCapabilities;
  #state: 'new' | 'mounting' | 'mounted' | 'destroyed' = 'new';
  #options: FakeEngineOptions;
  #view?: FakeViewEngine;
  #displayCrs?: CrsDef;
  #container?: Pick<HTMLElement, 'clientWidth' | 'clientHeight'>;
  #abortCleanup?: () => void;
  #cancelMount?: () => void;
  #allowExperimental = false;
  #layers = new Map<string, ResolvedLayer>();
  #sketches = new Set<{ data?: FeatureBatch; style?: PortableStyle }>();
  #pointers = new Set<(event: MapPointerEvent) => void>();
  #keys = new Set<(event: KeyboardEvent) => void>();
  #navigation = new Map<NavigationGesture, number>();
  #cursor: string | null = null;
  #hits: FeatureHit[] = [];
  #events: {
    [K in keyof EngineEvents]: Set<(event: EngineEvents[K]) => void>;
  } = {
    ready: new Set(),
    viewchange: new Set(),
    resize: new Set(),
    error: new Set(),
    destroy: new Set()
  };
  #operations: { type: string; id?: string }[] = [];

  constructor(options: FakeEngineOptions = {}) {
    this.#options = options;
    this.capabilities = {
      displayCrs: () => 'native',
      renderKinds: new Set([
        'features',
        'raster-tiles',
        'raster-image',
        'vector-tiles'
      ]),
      rasterReprojection: false,
      styleFeatures: new Set(['dash', 'label', 'halo-label', 'icon']),
      ...options.capabilities,
      rotation: false
    };
  }

  get layers(): ReadonlyMap<string, ResolvedLayer> {
    return new Map(
      [...this.#layers].map(([id, layer]) => [
        id,
        {
          ...layer,
          sourceCrs: structuredClone(layer.sourceCrs),
          style: layer.style ? structuredClone(layer.style) : undefined
        }
      ])
    );
  }

  get operations(): readonly { type: string; id?: string }[] {
    return this.#operations.map((operation) => ({ ...operation }));
  }
  get diagnostics() {
    return {
      state: this.#state,
      displayCrs: this.#displayCrs?.code,
      layers: this.#layers.size,
      sketches: this.#sketches.size,
      listeners:
        this.#pointers.size +
        this.#keys.size +
        Object.values(this.#events).reduce(
          (sum, listeners) => sum + listeners.size,
          0
        ),
      cursor: this.#cursor,
      suspended: [...this.#navigation.keys()]
    };
  }

  #mounted(): FakeViewEngine {
    if (this.#state !== 'mounted' || !this.#view)
      throw new MapError('ENGINE_STATE', { state: this.#state });
    return this.#view;
  }

  #emit<K extends keyof EngineEvents>(type: K, event: EngineEvents[K]): void {
    for (const handler of [...this.#events[type]]) handler(event);
  }

  on<K extends keyof EngineEvents>(
    type: K,
    handler: (event: EngineEvents[K]) => void
  ): () => void {
    if (this.#state === 'destroyed')
      throw new MapError('ENGINE_STATE', { state: this.#state });
    this.#events[type].add(handler);
    return () => {
      this.#events[type].delete(handler);
    };
  }

  async mount(
    container: Pick<HTMLElement, 'clientWidth' | 'clientHeight'>,
    init: EngineInit
  ): Promise<void> {
    if (this.#state !== 'new')
      throw new MapError('ENGINE_STATE', { state: this.#state });
    assertDisplayCrs(
      this.capabilities,
      init.displayCrs.code,
      init.allowExperimental
    );
    this.#state = 'mounting';
    const signal = init.signal;
    const abort = () => this.destroy();
    signal?.addEventListener('abort', abort, { once: true });
    this.#abortCleanup = () => signal?.removeEventListener('abort', abort);
    try {
      if (signal?.aborted) {
        this.destroy();
        throw new MapError('ENGINE_MOUNT_ABORTED');
      }
      const cancelled = new Promise<never>((_resolve, reject) => {
        this.#cancelMount = () => reject(new MapError('ENGINE_MOUNT_ABORTED'));
      });
      await Promise.race([
        Promise.resolve().then(() => this.#options.beforeMount?.()),
        cancelled
      ]);
      if (this.#isDestroyed() || signal?.aborted)
        throw new MapError('ENGINE_MOUNT_ABORTED');
      this.#container = container;
      this.#displayCrs = structuredClone(init.displayCrs);
      this.#allowExperimental = init.allowExperimental ?? false;
      this.#view = new FakeViewEngine({
        width: container.clientWidth,
        height: container.clientHeight,
        matrix: init.displayCrs.tileMatrix
      });
      this.#view.setView(init.view ?? {});
      this.#state = 'mounted';
      this.#operations.push({ type: 'mount' });
      this.#emit('ready', undefined);
    } catch (error) {
      this.destroy();
      throw error;
    } finally {
      this.#cancelMount = undefined;
    }
  }

  #isDestroyed(): boolean {
    return this.#state === 'destroyed';
  }

  async reconfigure(change: {
    displayCrs?: CrsDef;
  }): Promise<'done' | 'rebuild-required'> {
    const view = this.#mounted().getView();
    if (!change.displayCrs) return 'done';
    assertDisplayCrs(
      this.capabilities,
      change.displayCrs.code,
      this.#allowExperimental
    );
    if (this.#options.reconfigure === 'rebuild-required')
      return 'rebuild-required';
    if (this.#layers.size)
      throw new MapError('ENGINE_STATE', {
        reason: 'Detach managed layers before reconfiguring the fake.'
      });
    const replacement = new FakeViewEngine({
      width: this.#container?.clientWidth,
      height: this.#container?.clientHeight,
      matrix: change.displayCrs.tileMatrix
    });
    replacement.setView({ center: view.center, resolution: view.resolution });
    this.#view = replacement;
    this.#displayCrs = structuredClone(change.displayCrs);
    return 'done';
  }

  getView(): ViewState {
    return this.#mounted().getView();
  }
  setView(
    view: Partial<ViewState>,
    options?: { animate?: boolean; source?: 'api' | 'user' }
  ): void {
    this.#mounted().setView(view);
    this.#emit('viewchange', {
      view: this.getView(),
      source: options?.source ?? 'api'
    });
  }
  /** Simulates an engine navigation event without a DOM event. */
  userSetView(view: Partial<ViewState>): void {
    this.#mounted().setView(view);
    this.#emit('viewchange', { view: this.getView(), source: 'user' });
  }
  fitExtent(
    extent: Parameters<IMapEngine['fitExtent']>[0],
    options?: Parameters<IMapEngine['fitExtent']>[1]
  ): void {
    this.#mounted().fitExtent(extent, options);
    this.#emit('viewchange', { view: this.getView(), source: 'api' });
  }
  pixelToCoord(pixel: Pixel): Coord {
    return this.#mounted().pixelToCoord(pixel);
  }
  coordToPixel(coord: Coord): Pixel {
    return this.#mounted().coordToPixel(coord);
  }
  resolutionAt(coord: Coord): number {
    return this.#mounted().resolutionAt(coord);
  }
  resize(): void {
    const view = this.#mounted().getView();
    const width = this.#container?.clientWidth;
    const height = this.#container?.clientHeight;
    const replacement = new FakeViewEngine({
      width,
      height,
      matrix: this.#displayCrs?.tileMatrix
    });
    replacement.setView({ center: view.center, resolution: view.resolution });
    this.#view = replacement;
    this.#emit('resize', {
      width: replacement.width,
      height: replacement.height
    });
  }

  addLayer(layer: ResolvedLayer): LayerHandle {
    this.#mounted();
    const id = layer.id;
    if (this.#layers.has(id)) throw new MapError('LAYER_DUPLICATE', { id });
    if (
      layer.displayCrs !== this.#displayCrs?.code ||
      !this.capabilities.renderKinds.has(layer.renderKind)
    )
      throw new MapError('LAYER_INCOMPATIBLE', { id });
    const state = { ...layer };
    this.#layers.set(id, state);
    this.#operations.push({ type: 'add', id });
    const update = (change: Partial<ResolvedLayer>, operation: string) => {
      this.#mounted();
      if (this.#layers.get(id) !== state)
        throw new MapError('LAYER_REMOVED', { id });
      Object.assign(state, change);
      this.#operations.push({ type: operation, id });
    };
    const handle: LayerHandle = {
      setVisible: (visible) => update({ visible }, 'visible'),
      setOpacity: (opacity) => {
        if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1)
          throw new MapError('LAYER_INVALID', { id, field: 'opacity' });
        update({ opacity }, 'opacity');
      },
      setOrder: (order) => {
        if (!Number.isInteger(order))
          throw new MapError('LAYER_INVALID', { id, field: 'order' });
        update({ order }, 'order');
      },
      setStyle: (style) => update({ style: structuredClone(style) }, 'style'),
      remove: () => {
        if (this.#layers.get(id) !== state) return;
        this.#layers.delete(id);
        state.data = undefined;
        state.style = undefined;
        this.#operations.push({ type: 'remove', id });
      }
    };
    if (layer.renderKind === 'features')
      handle.setData = (data) => update({ data }, 'data');
    return handle;
  }

  readonly interaction: InteractionSurface = {
    onPointer: (handler) => {
      this.#mounted();
      this.#pointers.add(handler);
      return () => {
        this.#pointers.delete(handler);
      };
    },
    onKey: (handler) => {
      this.#mounted();
      this.#keys.add(handler);
      return () => {
        this.#keys.delete(handler);
      };
    },
    setCursor: (cursor) => {
      this.#mounted();
      this.#cursor = cursor;
    },
    suspend: (gestures) => {
      this.#mounted();
      const unique = [...new Set(gestures)];
      for (const gesture of unique)
        this.#navigation.set(gesture, (this.#navigation.get(gesture) ?? 0) + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        for (const gesture of unique) {
          const count = this.#navigation.get(gesture) ?? 0;
          if (count <= 1) this.#navigation.delete(gesture);
          else this.#navigation.set(gesture, count - 1);
        }
      };
    },
    sketch: () => this.#sketch(),
    hitTest: (_pixel, options) => {
      this.#mounted();
      if (!Number.isFinite(options.tolerancePx) || options.tolerancePx < 0)
        throw new MapError('LAYER_INVALID', {
          reason: 'Invalid hit tolerance.'
        });
      return structuredClone(
        this.#hits.filter(
          (hit) =>
            this.#layers.get(hit.layerId)?.visible &&
            hit.distancePx <= options.tolerancePx &&
            (!options.layers || options.layers.includes(hit.layerId))
        )
      );
    }
  };

  #sketch(): SketchRenderer {
    this.#mounted();
    const sketch: { data?: FeatureBatch; style?: PortableStyle } = {};
    this.#sketches.add(sketch);
    const active = () => {
      this.#mounted();
      if (!this.#sketches.has(sketch))
        throw new MapError('LAYER_REMOVED', { reason: 'Sketch was removed.' });
    };
    return {
      setData: (data, style) => {
        active();
        sketch.data = structuredClone(data);
        sketch.style = style ? structuredClone(style) : undefined;
      },
      clear: () => {
        active();
        sketch.data = undefined;
      },
      remove: () => {
        this.#sketches.delete(sketch);
        sketch.data = undefined;
        sketch.style = undefined;
      }
    };
  }

  setHitResults(hits: FeatureHit[]): void {
    this.#mounted();
    this.#hits = structuredClone(hits);
  }
  dispatchPointer(event: MapPointerEvent): void {
    this.#mounted();
    for (const handler of [...this.#pointers]) handler(event);
  }
  dispatchKey(event: KeyboardEvent): void {
    this.#mounted();
    for (const handler of [...this.#keys]) handler(event);
  }
  native<T = unknown>(): T {
    this.#mounted();
    return this as unknown as T;
  }

  destroy(): void {
    if (this.#state === 'destroyed') return;
    this.#state = 'destroyed';
    this.#cancelMount?.();
    this.#cancelMount = undefined;
    this.#abortCleanup?.();
    this.#abortCleanup = undefined;
    for (const layer of this.#layers.values()) {
      layer.data = undefined;
      layer.style = undefined;
    }
    for (const sketch of this.#sketches) {
      sketch.data = undefined;
      sketch.style = undefined;
    }
    this.#layers.clear();
    this.#sketches.clear();
    this.#pointers.clear();
    this.#keys.clear();
    this.#navigation.clear();
    this.#hits = [];
    this.#cursor = null;
    this.#view = undefined;
    this.#container = undefined;
    this.#operations.push({ type: 'destroy' });
    try {
      this.#emit('destroy', undefined);
    } finally {
      for (const listeners of Object.values(this.#events)) listeners.clear();
    }
  }
}

/** Destructive checks for an already-mounted engine; use a disposable instance. */
export function checkEngineConformance(
  engine: IMapEngine,
  layer: ResolvedLayer
): string[] {
  const failures = checkViewConformance(engine);
  const handle = engine.addLayer(layer);
  handle.setVisible(false);
  handle.setOpacity(0.5);
  handle.setOrder(2);
  handle.setStyle({});
  const release = engine.interaction.suspend(['dragPan', 'dblClickZoom']);
  release();
  release();
  const sketch = engine.interaction.sketch();
  sketch.setData({ type: 'FeatureCollection', features: [] });
  sketch.clear();
  sketch.remove();
  sketch.remove();
  const off = engine.on('viewchange', () => {});
  off();
  off();
  handle.remove();
  handle.remove();
  engine.destroy();
  engine.destroy();
  return failures;
}
