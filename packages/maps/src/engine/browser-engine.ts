import { MapError } from '../errors.ts';
import { geometryHitDistance } from './geometry-hit.ts';
import { assertLeafletStyle } from './leaflet-style.ts';
import { parseGeoJson } from '../sources/geojson.ts';
import { resolveViewResolution } from '../view.ts';
import type { Coord, CrsDef, Extent } from '../crs/types.ts';
import type { ViewState } from '../view.ts';
import type {
  EngineCapabilities,
  EngineEvents,
  EngineInit,
  FeatureBatch,
  IMapEngine,
  InteractionSurface,
  LayerHandle,
  MapPointerEvent,
  NavigationGesture,
  ResolvedLayer
} from './types.ts';

/** Shared DOM lifecycle and first-party interaction surface for native adapters. */
export abstract class BrowserEngine implements IMapEngine {
  abstract readonly id: string;
  abstract readonly capabilities: EngineCapabilities;
  abstract mount(container: HTMLElement, init: EngineInit): Promise<void>;
  abstract getView(): ViewState;
  abstract setView(
    view: Partial<ViewState>,
    options?: { animate?: boolean; source?: 'api' | 'user' }
  ): void;
  abstract pixelToCoord(pixel: Coord): Coord;
  abstract coordToPixel(coord: Coord): Coord;
  abstract resize(): void;
  abstract native<T = unknown>(): T;
  protected abstract disposeNative(): void;
  protected abstract navigation(
    gesture: NavigationGesture
  ): { enabled(): boolean; enable(): void; disable(): void } | undefined;
  protected abstract featureLayer(
    layer: ResolvedLayer,
    sketch: boolean
  ): LayerHandle;
  protected abstract rasterLayer(layer: ResolvedLayer): LayerHandle;
  protected featureCoord(coord: Coord): Coord {
    return coord;
  }
  protected definition?: CrsDef;
  protected container?: HTMLElement;
  protected destroyed = false;
  protected mounting = false;
  protected source: 'api' | 'user' = 'api';
  protected cleanups: (() => void)[] = [];
  #handles = new Map<string, LayerHandle>();
  #features = new Map<string, { layer: ResolvedLayer; sketch: boolean }>();
  #pointers = new Set<(event: MapPointerEvent) => void>();
  #keys = new Set<(event: KeyboardEvent) => void>();
  #suspended = new Map<
    NavigationGesture,
    { count: number; enabled: boolean }
  >();
  #sequence = 0;
  #frame?: number;
  #events: {
    [K in keyof EngineEvents]: Set<(event: EngineEvents[K]) => void>;
  } = {
    ready: new Set(),
    viewchange: new Set(),
    resize: new Set(),
    error: new Set(),
    destroy: new Set()
  };
  protected assertActive(): void {
    if (!this.container || this.destroyed) throw new MapError('ENGINE_STATE');
  }
  protected begin(container: HTMLElement, init: EngineInit): void {
    if (this.container || this.mounting || this.destroyed)
      throw new MapError('ENGINE_STATE');
    this.mounting = true;
    this.definition = structuredClone(init.displayCrs);
    const abort = () => this.destroy();
    init.signal?.addEventListener('abort', abort, { once: true });
    this.cleanups.push(() => init.signal?.removeEventListener('abort', abort));
    if (init.signal?.aborted) {
      this.destroy();
      throw new MapError('ENGINE_MOUNT_ABORTED');
    }
    this.container = container;
  }
  protected emit<K extends keyof EngineEvents>(
    type: K,
    event: EngineEvents[K]
  ): void {
    for (const callback of [...this.#events[type]]) callback(event);
  }
  protected changed(): void {
    if (this.destroyed) return;
    if (this.#frame !== undefined) cancelAnimationFrame(this.#frame);
    const source = this.source;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = undefined;
      if (!this.destroyed)
        this.emit('viewchange', { view: this.getView(), source });
    });
  }
  on<K extends keyof EngineEvents>(
    type: K,
    callback: (event: EngineEvents[K]) => void
  ): () => void {
    if (this.destroyed) throw new MapError('ENGINE_STATE');
    this.#events[type].add(callback);
    return () => {
      this.#events[type].delete(callback);
    };
  }
  protected finish(): void {
    const container = this.container!;
    const listen = (name: string, callback: EventListener, capture = false) => {
      container.addEventListener(name, callback, capture);
      this.cleanups.push(() =>
        container.removeEventListener(name, callback, capture)
      );
    };
    listen(
      'wheel',
      () => {
        this.source = 'user';
      },
      true
    );
    const types = {
      pointerdown: 'down',
      pointermove: 'move',
      pointerup: 'up',
      click: 'click',
      dblclick: 'dblclick',
      contextmenu: 'contextmenu'
    } as const;
    for (const [name, type] of Object.entries(types))
      listen(
        name,
        (event) => {
          if (!(event instanceof MouseEvent)) return;
          if (type === 'down') this.source = 'user';
          const rect = container.getBoundingClientRect();
          const pixel: Coord = [
            event.clientX - rect.left,
            event.clientY - rect.top
          ];
          const message: MapPointerEvent = {
            type,
            pixel,
            coord: this.pixelToCoord(pixel),
            pointerType:
              event instanceof PointerEvent &&
              ['pen', 'touch'].includes(event.pointerType)
                ? (event.pointerType as 'pen' | 'touch')
                : 'mouse',
            buttons: event.buttons,
            modifiers: {
              alt: event.altKey,
              ctrl: event.ctrlKey,
              meta: event.metaKey,
              shift: event.shiftKey
            },
            originalEvent: event,
            preventDefault: () => event.preventDefault()
          };
          for (const callback of [...this.#pointers]) callback(message);
        },
        true
      );
    listen('keydown', (event) => {
      if (!(event instanceof KeyboardEvent)) return;
      for (const callback of [...this.#keys]) callback(event);
      if (
        event.defaultPrevented ||
        this.#suspended.has('keyboard') ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      const delta: Record<string, Coord> = {
        ArrowLeft: [-80, 0],
        ArrowRight: [80, 0],
        ArrowUp: [0, -80],
        ArrowDown: [0, 80]
      };
      const shift = delta[event.key];
      if (shift) {
        event.preventDefault();
        if (event.shiftKey && this.capabilities.rotation) {
          const direction = ['ArrowLeft', 'ArrowDown'].includes(event.key)
            ? -1
            : 1;
          const angle = this.getView().rotation + direction * (Math.PI / 12);
          this.setView(
            { rotation: Math.atan2(Math.sin(angle), Math.cos(angle)) },
            { source: 'user' }
          );
          return;
        }
        this.setView(
          {
            center: this.pixelToCoord([
              container.clientWidth / 2 + shift[0],
              container.clientHeight / 2 + shift[1]
            ])
          },
          { source: 'user' }
        );
      } else if (['+', '=', '-'].includes(event.key)) {
        event.preventDefault();
        this.setView(
          {
            resolution:
              this.getView().resolution * (event.key === '-' ? 2 : 0.5)
          },
          { source: 'user' }
        );
      }
    });
    const theme = new MutationObserver(() => {
      try {
        for (const [id, entry] of this.#features)
          this.#handles.get(id)?.setStyle(entry.layer.style ?? {});
      } catch (cause) {
        this.emit(
          'error',
          cause instanceof MapError ? cause : new MapError('STYLE_UNSUPPORTED')
        );
      }
    });
    theme.observe(container.ownerDocument.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-cii-theme']
    });
    this.cleanups.push(() => theme.disconnect());
    this.mounting = false;
    this.emit('ready', undefined);
  }
  protected color(value?: string): string {
    if (value !== undefined && !value.startsWith('token:')) return value;
    const token = value?.slice(6) ?? '--cii-map-feature';
    const color = getComputedStyle(this.container!)
      .getPropertyValue(token)
      .trim();
    if (!/^--cii-[\w-]+$/.test(token) || !color)
      throw new MapError('STYLE_UNSUPPORTED', {
        reason:
          'Unresolved theme colour token. Import @cii/tokens/tokens.css and check the token name.'
      });
    return color;
  }
  protected validateStyle(layer: ResolvedLayer): void {
    if (layer.renderKind === 'raster-tiles') {
      if (Object.keys(layer.style ?? {}).length)
        throw new MapError('STYLE_UNSUPPORTED', {
          reason: 'Raster tiles support layer opacity, not feature styles.'
        });
    } else {
      assertLeafletStyle(layer.style);
      this.color(layer.style?.stroke?.color);
      this.color(layer.style?.fill?.color);
    }
  }
  addLayer(input: ResolvedLayer): LayerHandle {
    return this.#add(input, false);
  }
  #add(input: ResolvedLayer, sketch: boolean): LayerHandle {
    this.assertActive();
    if (
      input.displayCrs !== this.definition!.code ||
      !this.capabilities.renderKinds.has(input.renderKind)
    )
      throw new MapError('LAYER_INCOMPATIBLE', { id: input.id });
    if (this.#handles.has(input.id))
      throw new MapError('LAYER_DUPLICATE', { id: input.id });
    const layer = {
      ...input,
      style: input.style ? structuredClone(input.style) : undefined
    };
    if (input.renderKind === 'features') layer.data = parseGeoJson(input.data);
    this.validateStyle(layer);
    const native =
      layer.renderKind === 'features'
        ? this.featureLayer(layer, sketch)
        : this.rasterLayer(layer);
    const active = () => {
      this.assertActive();
      if (this.#handles.get(layer.id) !== handle)
        throw new MapError('LAYER_REMOVED', { id: layer.id });
    };
    const handle: LayerHandle = {
      setVisible: (visible) => {
        active();
        native.setVisible(visible);
        layer.visible = visible;
      },
      setOpacity: (opacity) => {
        active();
        if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1)
          throw new MapError('LAYER_INVALID');
        native.setOpacity(opacity);
        layer.opacity = opacity;
      },
      setOrder: (order) => {
        active();
        if (!Number.isInteger(order)) throw new MapError('LAYER_INVALID');
        native.setOrder(order);
        layer.order = order;
      },
      setStyle: (style) => {
        active();
        this.validateStyle({ ...layer, style });
        native.setStyle(style);
        layer.style = structuredClone(style);
      },
      ...(native.setData
        ? {
            setData: (data: FeatureBatch) => {
              active();
              const next = parseGeoJson(data);
              native.setData!(next);
              layer.data = next;
            }
          }
        : {}),
      remove: () => {
        if (this.#handles.get(layer.id) !== handle) return;
        this.#handles.delete(layer.id);
        this.#features.delete(layer.id);
        native.remove();
      }
    };
    this.#handles.set(layer.id, handle);
    if (layer.renderKind === 'features')
      this.#features.set(layer.id, { layer, sketch });
    return handle;
  }
  resolutionAt(_coord: Coord): number {
    return this.getView().resolution;
  }
  fitExtent(
    extent: Extent,
    options: { padding?: number; maxZoom?: number } = {}
  ): void {
    this.assertActive();
    const padding = options.padding ?? 0;
    const width = this.container!.clientWidth - 2 * padding,
      height = this.container!.clientHeight - 2 * padding;
    if (
      !extent.every(Number.isFinite) ||
      extent[2] <= extent[0] ||
      extent[3] <= extent[1] ||
      !Number.isFinite(padding) ||
      padding < 0 ||
      width <= 0 ||
      height <= 0
    )
      throw new MapError('VIEW_INVALID');
    // Include rotation when fitting an axis-aligned display extent.
    const rotation = this.getView().rotation,
      c = Math.abs(Math.cos(rotation)),
      s = Math.abs(Math.sin(rotation));
    const x = extent[2] - extent[0],
      y = extent[3] - extent[1];
    let resolution = Math.max(
      (x * c + y * s) / width,
      (x * s + y * c) / height
    );
    if (options.maxZoom !== undefined)
      resolution = Math.max(
        resolution,
        resolveViewResolution(
          { zoom: options.maxZoom },
          this.definition?.tileMatrix
        )
      );
    this.setView({
      center: [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2],
      resolution
    });
  }
  async reconfigure(change: {
    displayCrs?: CrsDef;
  }): Promise<'done' | 'rebuild-required'> {
    this.assertActive();
    return !change.displayCrs ||
      change.displayCrs.code === this.definition?.code
      ? 'done'
      : 'rebuild-required';
  }
  readonly interaction: InteractionSurface = {
    onPointer: (callback) => {
      this.assertActive();
      this.#pointers.add(callback);
      return () => {
        this.#pointers.delete(callback);
      };
    },
    onKey: (callback) => {
      this.assertActive();
      this.#keys.add(callback);
      return () => {
        this.#keys.delete(callback);
      };
    },
    setCursor: (cursor) => {
      this.assertActive();
      this.container!.style.cursor = cursor ?? '';
    },
    suspend: (gestures) => {
      this.assertActive();
      const unique = new Set(gestures);
      for (const gesture of unique) {
        const current = this.#suspended.get(gesture);
        if (current) current.count++;
        else {
          const handler = this.navigation(gesture);
          this.#suspended.set(gesture, {
            count: 1,
            enabled: handler?.enabled() ?? true
          });
          handler?.disable();
        }
      }
      let released = false;
      return () => {
        if (released || this.destroyed) return;
        released = true;
        for (const gesture of unique) {
          const current = this.#suspended.get(gesture);
          if (current && --current.count === 0) {
            this.#suspended.delete(gesture);
            if (current.enabled) this.navigation(gesture)?.enable();
          }
        }
      };
    },
    sketch: () => {
      const handle = this.#add(
        {
          id: `__cii-sketch-${++this.#sequence}`,
          renderKind: 'features',
          displayCrs: this.definition!.code,
          sourceCrs: {
            crs: { code: this.definition!.code, axisOrder: 'xy' },
            provenance: { kind: 'declared', by: 'sketch' },
            confirmedAt: new Date().toISOString()
          },
          data: { type: 'FeatureCollection', features: [] },
          visible: true,
          opacity: 1,
          order: 1_000_000
        },
        true
      );
      return {
        setData: (data, style) => {
          if (style) handle.setStyle(style);
          handle.setData!(data);
        },
        clear: () =>
          handle.setData!({ type: 'FeatureCollection', features: [] }),
        remove: handle.remove
      };
    },
    hitTest: (pixel, options) => {
      this.assertActive();
      if (!Number.isFinite(options.tolerancePx) || options.tolerancePx < 0)
        throw new MapError('LAYER_INVALID');
      return [...this.#features.values()]
        .filter(
          ({ layer, sketch }) =>
            !sketch &&
            layer.visible &&
            layer.opacity > 0 &&
            (!options.layers || options.layers.includes(layer.id))
        )
        .sort((a, b) => b.layer.order - a.layer.order)
        .flatMap(({ layer }) =>
          (layer.data as FeatureBatch).features.flatMap((feature) => {
            if (!feature.geometry) return [];
            let distance = geometryHitDistance(
              feature.geometry,
              pixel,
              (coord) =>
                this.coordToPixel(this.featureCoord([coord[0], coord[1]]))
            );
            if (['Point', 'MultiPoint'].includes(feature.geometry.type))
              distance = Math.max(
                0,
                distance - (layer.style?.point?.size ?? 10) / 2
              );
            return distance <= options.tolerancePx
              ? [{ layerId: layer.id, feature, distancePx: distance }]
              : [];
          })
        );
    }
  };
  destroy(): void {
    if (this.destroyed) return;
    if (this.#frame !== undefined) cancelAnimationFrame(this.#frame);
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    for (const handle of [...this.#handles.values()]) handle.remove();
    this.destroyed = true;
    this.disposeNative();
    this.#pointers.clear();
    this.#keys.clear();
    this.#suspended.clear();
    try {
      this.emit('destroy', undefined);
    } finally {
      for (const callbacks of Object.values(this.#events)) callbacks.clear();
    }
  }
}
