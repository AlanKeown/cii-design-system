import type * as Leaflet from 'leaflet';
import { assertXyzTileData } from './sources/xyz.ts';
import { MapError } from './errors.ts';
import { loadLeaflet } from './engine/leaflet-api.ts';
import { assertDisplayCrs } from './engine/registry.ts';
import { resolveViewResolution, resolutionToZoom } from './view.ts';
import { geometryHitDistance } from './engine/geometry-hit.ts';
import { assertLeafletStyle } from './engine/leaflet-style.ts';
import { parseGeoJson } from './sources/geojson.ts';
import type { Coord, CrsDef } from './crs/types.ts';
import type { ViewState } from './view.ts';
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
  PortableStyle,
  ResolvedLayer,
  SketchRenderer
} from './engine/types.ts';

interface Entry {
  id: string;
  data: FeatureBatch;
  style?: PortableStyle;
  visible: boolean;
  opacity: number;
  order: number;
  group: Leaflet.GeoJSON;
  renderer: Leaflet.Canvas;
  pane: HTMLElement;
  paneName: string;
  sketch: boolean;
}

/** Leaflet is dynamically imported inside mount: importing this adapter is SSR-safe. */
export default class LeafletEngine implements IMapEngine {
  readonly id = 'leaflet';
  readonly capabilities: EngineCapabilities = {
    displayCrs: (code) =>
      ['EPSG:3857', 'EPSG:4326', 'OGC:CRS84'].includes(code)
        ? 'native'
        : 'unsupported',
    renderKinds: new Set(['features', 'raster-tiles']),
    rasterReprojection: false,
    rotation: false,
    styleFeatures: new Set(['dash'])
  };
  #library?: typeof Leaflet;
  #map?: Leaflet.Map;
  #definition?: CrsDef;
  #destroyed = false;
  #mounting = false;
  #entries = new Map<string, Entry>();
  #tiles = new Map<
    string,
    { layer: Leaflet.TileLayer; pane: HTMLElement; paneName: string }
  >();
  #sequence = 0;
  #cleanups: (() => void)[] = [];
  #frame?: number;
  #source: 'api' | 'user' = 'api';
  #pointers = new Set<(event: MapPointerEvent) => void>();
  #keys = new Set<(event: KeyboardEvent) => void>();
  #suspended = new Map<
    NavigationGesture,
    { count: number; enabled: boolean }
  >();
  #events: {
    [K in keyof EngineEvents]: Set<(event: EngineEvents[K]) => void>;
  } = {
    ready: new Set(),
    viewchange: new Set(),
    resize: new Set(),
    error: new Set(),
    destroy: new Set()
  };

  #getMap(): Leaflet.Map {
    if (!this.#map || this.#destroyed) throw new MapError('ENGINE_STATE');
    return this.#map;
  }
  #crs(): Leaflet.CRS {
    return this.#definition?.code === 'EPSG:3857'
      ? this.#library!.CRS.EPSG3857
      : this.#library!.CRS.EPSG4326;
  }
  #baseResolution(): number {
    return this.#definition?.code === 'EPSG:3857'
      ? (2 * Math.PI * 6378137) / 256
      : 180 / 256;
  }
  #emit<K extends keyof EngineEvents>(type: K, event: EngineEvents[K]): void {
    for (const callback of [...this.#events[type]]) callback(event);
  }
  on<K extends keyof EngineEvents>(
    type: K,
    callback: (event: EngineEvents[K]) => void
  ): () => void {
    if (this.#destroyed) throw new MapError('ENGINE_STATE');
    this.#events[type].add(callback);
    return () => {
      this.#events[type].delete(callback);
    };
  }

  async mount(container: HTMLElement, init: EngineInit): Promise<void> {
    if (this.#map || this.#mounting || this.#destroyed)
      throw new MapError('ENGINE_STATE');
    assertDisplayCrs(
      this.capabilities,
      init.displayCrs.code,
      init.allowExperimental
    );
    this.#mounting = true;
    const abort = () => this.destroy();
    init.signal?.addEventListener('abort', abort, { once: true });
    this.#cleanups.push(() => init.signal?.removeEventListener('abort', abort));
    try {
      const L = await loadLeaflet();
      if (this.#destroyed || init.signal?.aborted)
        throw new MapError('ENGINE_MOUNT_ABORTED');
      this.#library = L;
      this.#definition = structuredClone(init.displayCrs);
      const reduced = matchMedia('(prefers-reduced-motion: reduce)');
      this.#map = new L.Map(container, {
        crs: this.#crs(),
        zoomControl: false,
        attributionControl: false,
        preferCanvas: true,
        keyboard: false,
        trackResize: false,
        zoomSnap: 0,
        minZoom: -24,
        maxZoom: 32,
        inertia: !reduced.matches,
        zoomAnimation: false,
        fadeAnimation: false
      });
      const motion = () => {
        if (this.#map) this.#map.options.inertia = !reduced.matches;
      };
      reduced.addEventListener('change', motion);
      this.#cleanups.push(() => reduced.removeEventListener('change', motion));
      const resolution = resolveViewResolution(
        {
          resolution: init.view?.resolution,
          zoom:
            init.view?.zoom ??
            (init.view?.resolution === undefined && init.displayCrs.tileMatrix
              ? 0
              : undefined)
        },
        init.displayCrs.tileMatrix
      );
      const center = init.view?.center ?? [0, 0];
      if (init.view?.rotation !== undefined && init.view.rotation !== 0)
        throw new MapError('VIEW_INVALID', {
          reason: 'Leaflet rotation is unsupported.'
        });
      this.#applyView(center, resolution);
      const changed = () => {
        if (this.#frame !== undefined) cancelAnimationFrame(this.#frame);
        const source = this.#source;
        this.#frame = requestAnimationFrame(() => {
          this.#frame = undefined;
          if (!this.#destroyed)
            this.#emit('viewchange', { view: this.getView(), source });
        });
      };
      this.#map.on('moveend', changed);
      this.#cleanups.push(() => this.#map?.off('moveend', changed));
      const user = () => {
        this.#source = 'user';
      };
      container.addEventListener('wheel', user, {
        capture: true,
        passive: true
      });
      this.#cleanups.push(() =>
        container.removeEventListener('wheel', user, true)
      );
      const pointerTypes = {
        pointerdown: 'down',
        pointermove: 'move',
        pointerup: 'up',
        click: 'click',
        dblclick: 'dblclick',
        contextmenu: 'contextmenu'
      } as const;
      for (const [name, type] of Object.entries(pointerTypes)) {
        const listener = (event: Event) => {
          if (!(event instanceof MouseEvent)) return;
          if (type === 'down') this.#source = 'user';
          const point = this.#getMap().mouseEventToContainerPoint(event);
          const pixel: Coord = [point.x, point.y];
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
          for (const handler of [...this.#pointers]) handler(message);
        };
        container.addEventListener(name, listener, true);
        this.#cleanups.push(() =>
          container.removeEventListener(name, listener, true)
        );
      }
      const key = (event: KeyboardEvent) => {
        this.#source = 'user';
        for (const handler of [...this.#keys]) handler(event);
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
        if (delta[event.key]) {
          event.preventDefault();
          const [x, y] = delta[event.key];
          this.#map?.panBy([x, y], { animate: false });
        } else if (['+', '=', '-'].includes(event.key)) {
          event.preventDefault();
          const view = this.getView();
          const zoom = Math.max(
            -24,
            Math.min(
              32,
              this.#getMap().getZoom() + (event.key === '-' ? -1 : 1)
            )
          );
          this.#applyView(view.center, this.#baseResolution() / 2 ** zoom);
        }
      };
      container.addEventListener('keydown', key);
      this.#cleanups.push(() => container.removeEventListener('keydown', key));
      const theme = new MutationObserver(() => {
        for (const entry of this.#entries.values()) this.#restyle(entry);
      });
      theme.observe(document.documentElement, {
        attributes: true,
        subtree: true,
        attributeFilter: ['data-cii-theme']
      });
      this.#cleanups.push(() => theme.disconnect());
      this.#emit('ready', undefined);
    } catch (error) {
      this.destroy();
      throw error;
    } finally {
      this.#mounting = false;
    }
  }

  #applyView(center: Coord, resolution: number, animate = false): void {
    if (
      center.length !== 2 ||
      !center.every(Number.isFinite) ||
      !Number.isFinite(resolution) ||
      resolution <= 0
    )
      throw new MapError('VIEW_INVALID');
    const zoom = Math.log2(this.#baseResolution() / resolution);
    if (!Number.isFinite(zoom) || zoom < -24 || zoom > 32)
      throw new MapError('VIEW_INVALID', {
        reason: 'Resolution is outside Leaflet adapter limits.'
      });
    const L = this.#library!;
    // Native same-zoom pans round to CSS pixels. Read the resulting centre back
    // from Leaflet; do not invent a more precise rendered position.
    this.#getMap().setView(
      this.#crs().unproject(new L.Point(center[0], center[1])),
      zoom,
      {
        animate:
          animate && !matchMedia('(prefers-reduced-motion: reduce)').matches
      }
    );
  }
  getView(): ViewState {
    const map = this.#getMap();
    const center = this.#crs().project(map.getCenter());
    const resolution = this.#baseResolution() / 2 ** map.getZoom();
    const size = map.getSize();
    const lower = this.pixelToCoord([0, size.y]);
    const upper = this.pixelToCoord([size.x, 0]);
    return {
      center: [center.x, center.y],
      resolution,
      rotation: 0,
      zoom: this.#definition?.tileMatrix
        ? resolutionToZoom(resolution, this.#definition.tileMatrix)
        : undefined,
      extent: [lower[0], lower[1], upper[0], upper[1]]
    };
  }
  setView(
    view: Partial<ViewState>,
    options?: { animate?: boolean; source?: 'api' | 'user' }
  ): void {
    if (view.rotation !== undefined && view.rotation !== 0)
      throw new MapError('VIEW_INVALID', {
        reason: 'Rotation is unsupported.'
      });
    const current = this.getView();
    const resolution =
      view.resolution !== undefined || view.zoom !== undefined
        ? resolveViewResolution(view, this.#definition?.tileMatrix)
        : current.resolution;
    this.#source = options?.source ?? 'api';
    this.#applyView(
      view.center ?? current.center,
      resolution,
      options?.animate
    );
  }
  fitExtent(
    extent: ViewState['extent'],
    options: { padding?: number; maxZoom?: number } = {}
  ): void {
    const size = this.#getMap().getSize();
    const padding = options.padding ?? 0;
    const [x1, y1, x2, y2] = extent;
    const width = size.x - 2 * padding;
    const height = size.y - 2 * padding;
    if (
      !extent.every(Number.isFinite) ||
      x2 <= x1 ||
      y2 <= y1 ||
      padding < 0 ||
      !Number.isFinite(padding) ||
      width <= 0 ||
      height <= 0
    )
      throw new MapError('VIEW_INVALID');
    let resolution = Math.max((x2 - x1) / width, (y2 - y1) / height);
    if (options.maxZoom !== undefined)
      resolution = Math.max(
        resolution,
        resolveViewResolution(
          { zoom: options.maxZoom },
          this.#definition?.tileMatrix
        )
      );
    this.setView({ center: [(x1 + x2) / 2, (y1 + y2) / 2], resolution });
  }
  pixelToCoord(pixel: Coord): Coord {
    const map = this.#getMap();
    const center = this.#crs().project(map.getCenter());
    const size = map.getSize();
    const resolution = this.#baseResolution() / 2 ** map.getZoom();
    return [
      center.x + (pixel[0] - size.x / 2) * resolution,
      center.y - (pixel[1] - size.y / 2) * resolution
    ];
  }
  coordToPixel(coord: Coord): Coord {
    const map = this.#getMap();
    const center = this.#crs().project(map.getCenter());
    const size = map.getSize();
    const resolution = this.#baseResolution() / 2 ** map.getZoom();
    return [
      size.x / 2 + (coord[0] - center.x) / resolution,
      size.y / 2 - (coord[1] - center.y) / resolution
    ];
  }
  resolutionAt(_coord: Coord): number {
    return this.getView().resolution;
  }
  resize(): void {
    this.#getMap().invalidateSize({ animate: false });
    const size = this.#getMap().getSize();
    this.#emit('resize', { width: size.x, height: size.y });
  }
  async reconfigure(change: {
    displayCrs?: CrsDef;
  }): Promise<'done' | 'rebuild-required'> {
    this.#getMap();
    if (!change.displayCrs) return 'done';
    assertDisplayCrs(this.capabilities, change.displayCrs.code);
    return change.displayCrs.code === this.#definition?.code
      ? 'done'
      : 'rebuild-required';
  }

  #color(value: string | undefined): string {
    if (value !== undefined && !value.startsWith('token:')) return value;
    const token = value?.slice(6) ?? '--cii-map-feature';
    const color = getComputedStyle(this.#getMap().getContainer())
      .getPropertyValue(token)
      .trim();
    if (!/^--cii-[\w-]+$/.test(token) || !color)
      throw new MapError('STYLE_UNSUPPORTED', {
        reason:
          'Unresolved theme colour token. Import @cii/tokens/tokens.css and check the token name.'
      });
    return color;
  }
  #path(entry: Entry): Leaflet.PathOptions {
    return {
      pane: entry.paneName,
      renderer: entry.renderer,
      interactive: false,
      color: this.#color(entry.style?.stroke?.color),
      weight: entry.style?.stroke?.width ?? 2,
      opacity: entry.opacity * (entry.style?.stroke?.opacity ?? 1),
      fillColor: this.#color(entry.style?.fill?.color),
      fillOpacity: entry.opacity * (entry.style?.fill?.opacity ?? 0.2),
      dashArray: entry.style?.stroke?.dash?.join(' ')
    };
  }
  #restyle(entry: Entry): void {
    entry.group.setStyle(this.#path(entry));
    const visit = (item: Leaflet.Layer) => {
      if (item instanceof this.#library!.CircleMarker)
        item.setRadius((entry.style?.point?.size ?? 10) / 2);
      else if (item instanceof this.#library!.LayerGroup) item.eachLayer(visit);
    };
    entry.group.eachLayer(visit);
  }
  #add(
    input: Pick<
      ResolvedLayer,
      'id' | 'data' | 'style' | 'visible' | 'opacity' | 'order'
    >,
    sketch = false
  ): LayerHandle {
    const map = this.#getMap();
    const L = this.#library!;
    assertLeafletStyle(input.style);
    if (this.#entries.has(input.id) || this.#tiles.has(input.id))
      throw new MapError('LAYER_DUPLICATE', { id: input.id });
    const data = parseGeoJson(input.data);
    const paneName = `cii-layer-${++this.#sequence}`;
    const pane = map.createPane(paneName);
    pane.style.zIndex = String(400 + input.order);
    pane.style.pointerEvents = 'none';
    const renderer = new L.Canvas({ pane: paneName });
    const entry: Entry = {
      ...input,
      data,
      pane,
      paneName,
      renderer,
      group: new L.GeoJSON(),
      sketch
    };
    try {
      entry.group = new L.GeoJSON(data, {
        pane: paneName,
        coordsToLatLng: sketch
          ? (point) => this.#crs().unproject(new L.Point(point[0], point[1]))
          : undefined,
        style: () => this.#path(entry),
        pointToLayer: (_feature, latlng) =>
          new L.CircleMarker(latlng, {
            ...this.#path(entry),
            radius: (entry.style?.point?.size ?? 10) / 2
          })
      });
      if (entry.visible) entry.group.addTo(map);
      this.#entries.set(entry.id, entry);
    } catch (error) {
      map.removeLayer(renderer);
      pane.remove();
      delete map.getPanes()[paneName];
      throw error;
    }
    const active = () => {
      this.#getMap();
      if (this.#entries.get(entry.id) !== entry)
        throw new MapError('LAYER_REMOVED', { id: entry.id });
    };
    return {
      setVisible: (visible) => {
        active();
        entry.visible = visible;
        if (visible) entry.group.addTo(map);
        else map.removeLayer(entry.group);
      },
      setOpacity: (opacity) => {
        active();
        if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1)
          throw new MapError('LAYER_INVALID');
        entry.opacity = opacity;
        this.#restyle(entry);
      },
      setOrder: (order) => {
        active();
        if (!Number.isInteger(order)) throw new MapError('LAYER_INVALID');
        entry.order = order;
        pane.style.zIndex = String(400 + order);
      },
      setStyle: (style) => {
        active();
        assertLeafletStyle(style);
        this.#color(style.stroke?.color);
        this.#color(style.fill?.color);
        entry.style = structuredClone(style);
        this.#restyle(entry);
      },
      setData: (batch) => {
        active();
        const next = parseGeoJson(batch);
        entry.group.clearLayers();
        entry.group.addData(next);
        entry.data = next;
      },
      remove: () => {
        if (this.#entries.get(entry.id) !== entry) return;
        this.#entries.delete(entry.id);
        entry.group.clearLayers();
        map.removeLayer(entry.group);
        map.removeLayer(renderer);
        pane.remove();
        delete map.getPanes()[paneName];
        entry.data = { type: 'FeatureCollection', features: [] };
      }
    };
  }
  #addTiles(input: ResolvedLayer): LayerHandle {
    const map = this.#getMap();
    if (this.#entries.has(input.id) || this.#tiles.has(input.id))
      throw new MapError('LAYER_DUPLICATE', { id: input.id });
    if (
      input.displayCrs !== 'EPSG:3857' ||
      input.sourceCrs.crs.code !== 'EPSG:3857'
    )
      throw new MapError('LAYER_INCOMPATIBLE', { id: input.id });
    assertXyzTileData(input.data);
    const assertStyle = (style?: PortableStyle) => {
      if (style && Object.keys(style).length)
        throw new MapError('STYLE_UNSUPPORTED', {
          renderKind: 'raster-tiles',
          reason: 'Raster tiles support layer opacity, not feature styles.'
        });
    };
    assertStyle(input.style);
    const paneName = `cii-layer-${++this.#sequence}`;
    const pane = map.createPane(paneName);
    pane.style.zIndex = String(400 + input.order);
    pane.style.pointerEvents = 'none';
    const layer = new this.#library!.TileLayer(input.data.url, {
      pane: paneName,
      tileSize: 256,
      minZoom: 0,
      maxZoom: 24,
      opacity: input.opacity,
      keepBuffer: 0,
      // Credits are always rendered as plain text by MapContainer.
      attribution: undefined
    });
    const entry = { layer, pane, paneName };
    const failed = () => {
      if (this.#tiles.get(input.id) === entry)
        this.#emit(
          'error',
          new MapError('LAYER_LOAD_FAILED', {
            id: input.id,
            provider: 'xyz',
            reason:
              'An XYZ tile could not be loaded. Check the tile service and toggle the layer to retry.'
          })
        );
    };
    layer.on('tileerror', failed);
    this.#tiles.set(input.id, entry);
    const remove = () => {
      if (this.#tiles.get(input.id) !== entry) return;
      this.#tiles.delete(input.id);
      map.removeLayer(layer);
      layer.off();
      pane.remove();
      delete map.getPanes()[paneName];
    };
    try {
      if (input.visible) layer.addTo(map);
    } catch (error) {
      remove();
      throw error;
    }
    const active = () => {
      this.#getMap();
      if (this.#tiles.get(input.id) !== entry)
        throw new MapError('LAYER_REMOVED', { id: input.id });
    };
    return {
      setVisible: (visible) => {
        active();
        if (visible) layer.addTo(map);
        else map.removeLayer(layer);
      },
      setOpacity: (opacity) => {
        active();
        if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1)
          throw new MapError('LAYER_INVALID');
        layer.setOpacity(opacity);
      },
      setOrder: (order) => {
        active();
        if (!Number.isInteger(order)) throw new MapError('LAYER_INVALID');
        pane.style.zIndex = String(400 + order);
      },
      setStyle: (style) => {
        active();
        assertStyle(style);
      },
      remove
    };
  }
  addLayer(layer: ResolvedLayer): LayerHandle {
    if (layer.displayCrs !== this.#definition?.code)
      throw new MapError('LAYER_INCOMPATIBLE', { id: layer.id });
    if (layer.renderKind === 'raster-tiles') return this.#addTiles(layer);
    if (layer.renderKind !== 'features')
      throw new MapError('LAYER_INCOMPATIBLE', { id: layer.id });
    return this.#add(layer);
  }
  readonly interaction: InteractionSurface = {
    onPointer: (callback) => {
      this.#getMap();
      this.#pointers.add(callback);
      return () => {
        this.#pointers.delete(callback);
      };
    },
    onKey: (callback) => {
      this.#getMap();
      this.#keys.add(callback);
      return () => {
        this.#keys.delete(callback);
      };
    },
    setCursor: (cursor) => {
      this.#getMap().getContainer().style.cursor = cursor ?? '';
    },
    suspend: (gestures) => {
      const map = this.#getMap();
      const handlers = {
        dragPan: map.dragging,
        dblClickZoom: map.doubleClickZoom,
        boxZoom: map.boxZoom,
        keyboard: undefined
      };
      for (const gesture of new Set(gestures)) {
        const current = this.#suspended.get(gesture);
        if (current) current.count++;
        else {
          this.#suspended.set(gesture, {
            count: 1,
            enabled: handlers[gesture]?.enabled() ?? true
          });
          handlers[gesture]?.disable();
        }
      }
      let released = false;
      return () => {
        if (released || this.#destroyed) return;
        released = true;
        for (const gesture of new Set(gestures)) {
          const current = this.#suspended.get(gesture);
          if (!current) continue;
          if (--current.count === 0) {
            this.#suspended.delete(gesture);
            if (current.enabled) handlers[gesture]?.enable();
          }
        }
      };
    },
    sketch: (): SketchRenderer => {
      const handle = this.#add(
        {
          id: `__sketch-${++this.#sequence}`,
          data: { type: 'FeatureCollection', features: [] },
          visible: true,
          opacity: 1,
          order: 100
        },
        true
      );
      return {
        setData: (data, style) => {
          if (style) handle.setStyle(style);
          handle.setData?.(data);
        },
        clear: () =>
          handle.setData?.({ type: 'FeatureCollection', features: [] }),
        remove: () => handle.remove()
      };
    },
    hitTest: (pixel, options) => {
      this.#getMap();
      if (!Number.isFinite(options.tolerancePx) || options.tolerancePx < 0)
        throw new MapError('LAYER_INVALID');
      const L = this.#library!;
      return [...this.#entries.values()]
        .filter(
          (entry) =>
            entry.visible &&
            entry.opacity > 0 &&
            !entry.sketch &&
            (!options.layers || options.layers.includes(entry.id))
        )
        .sort((a, b) => b.order - a.order)
        .flatMap((entry) =>
          entry.data.features.flatMap((feature) => {
            if (!feature.geometry) return [];
            let distance = geometryHitDistance(
              feature.geometry,
              pixel,
              (point) => {
                if (entry.sketch)
                  return this.coordToPixel([point[0], point[1]]);
                const projected = this.#crs().project(
                  new L.LatLng(point[1], point[0])
                );
                return this.coordToPixel([projected.x, projected.y]);
              }
            );
            if (['Point', 'MultiPoint'].includes(feature.geometry.type))
              distance = Math.max(
                0,
                distance - (entry.style?.point?.size ?? 10) / 2
              );
            return distance <= options.tolerancePx
              ? [{ layerId: entry.id, feature, distancePx: distance }]
              : [];
          })
        );
    }
  };
  native<T = unknown>(): T {
    return this.#getMap() as unknown as T;
  }
  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    if (this.#frame !== undefined) cancelAnimationFrame(this.#frame);
    for (const cleanup of this.#cleanups.splice(0)) cleanup();
    for (const entry of this.#entries.values()) {
      entry.group.clearLayers();
      entry.data = { type: 'FeatureCollection', features: [] };
    }
    for (const entry of this.#tiles.values()) {
      this.#map?.removeLayer(entry.layer);
      entry.layer.off();
      entry.pane.remove();
    }
    this.#tiles.clear();
    this.#map?.remove();
    this.#map = undefined;
    this.#entries.clear();
    this.#pointers.clear();
    this.#keys.clear();
    this.#suspended.clear();
    try {
      this.#emit('destroy', undefined);
    } finally {
      for (const callbacks of Object.values(this.#events)) callbacks.clear();
    }
  }
}
