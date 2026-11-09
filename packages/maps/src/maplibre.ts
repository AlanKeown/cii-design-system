import type {
  Map as MapLibreMap,
  GeoJSONSource,
  GeoJSONSourceSpecification,
  LayerSpecification
} from 'maplibre-gl';
import { BrowserEngine } from './engine/browser-engine.ts';
import { assertDisplayCrs } from './engine/registry.ts';
import { MapError } from './errors.ts';
import { resolveViewResolution, resolutionToZoom } from './view.ts';
import { ogcTileUrl, assertWmtsLeafletGrid } from './sources/ogc-raster.ts';
import type { OgcTileData } from './sources/ogc-raster.ts';
import { assertXyzTileData } from './sources/xyz.ts';
import type { Coord } from './crs/types.ts';
import type { ViewState } from './view.ts';
import type {
  EngineCapabilities,
  EngineInit,
  FeatureBatch,
  LayerHandle,
  NavigationGesture,
  PortableStyle,
  ResolvedLayer
} from './engine/types.ts';

const radius = 6378137;
const radians = Math.PI / 180;
const baseResolution = (2 * Math.PI * radius) / 512;
function project(coord: Coord): Coord {
  if (!coord.every(Number.isFinite) || Math.abs(coord[1]) > 85.0511287798066)
    throw new MapError('VIEW_INVALID', {
      reason: 'Coordinate is outside the native Web Mercator latitude range.'
    });
  return [
    radius * coord[0] * radians,
    radius * Math.log(Math.tan(Math.PI / 4 + (coord[1] * radians) / 2))
  ];
}
function unproject(coord: Coord): Coord {
  return [
    coord[0] / radius / radians,
    (2 * Math.atan(Math.exp(coord[1] / radius)) - Math.PI / 2) / radians
  ];
}
let sequence = 0;

/** Web Mercator production adapter; custom MapLibre projections remain out of scope. */
export default class MapLibreEngine extends BrowserEngine {
  readonly id = 'maplibre';
  readonly capabilities: EngineCapabilities = {
    displayCrs: (code) => (code === 'EPSG:3857' ? 'native' : 'unsupported'),
    renderKinds: new Set(['features', 'raster-tiles']),
    rasterReprojection: false,
    rotation: true,
    styleFeatures: new Set(['dash'])
  };
  #map?: MapLibreMap;
  #api?: typeof import('./engine/maplibre-api.ts');
  #protocol = `cii-maplibre-${++sequence}`;
  #tileUrls = new Map<
    string,
    (z: number, x: number, y: number) => string | null
  >();
  #layers = new Map<string, { ids: string[]; order: number }>();
  #sequence = 0;
  #get(): MapLibreMap {
    this.assertActive();
    if (!this.#map) throw new MapError('ENGINE_STATE');
    return this.#map;
  }
  async mount(container: HTMLElement, init: EngineInit): Promise<void> {
    this.begin(container, init);
    try {
      assertDisplayCrs(
        this.capabilities,
        init.displayCrs.code,
        init.allowExperimental
      );
      const api = await import('./engine/maplibre-api.ts');
      if (this.destroyed || init.signal?.aborted)
        throw new MapError('ENGINE_MOUNT_ABORTED');
      this.#api = api;
      api.addProtocol(this.#protocol, async (request, abort) => {
        const url = new URL(request.url);
        const [z, x, y] = url.pathname.slice(1).split('/').map(Number);
        const resolve = this.#tileUrls.get(url.hostname);
        if (!resolve || this.destroyed) throw new MapError('LAYER_REMOVED');
        const target = resolve(z, x, y);
        if (!target) return { data: blankTile() };
        const response = await fetch(
          new URL(target, container.ownerDocument.baseURI),
          { signal: abort.signal }
        );
        if (!response.ok) throw new MapError('LAYER_LOAD_FAILED');
        return { data: await response.arrayBuffer() };
      });
      const resolution = resolveViewResolution(
        {
          resolution: init.view?.resolution,
          zoom:
            init.view?.zoom ??
            (init.view?.resolution === undefined ? 0 : undefined)
        },
        this.definition!.tileMatrix
      );
      const center = init.view?.center ?? [0, 0],
        rotation = init.view?.rotation ?? 0;
      const zoom = this.#zoom(resolution);
      const geographic = unproject(center);
      project(geographic);
      if (!center.every(Number.isFinite) || !Number.isFinite(rotation))
        throw new MapError('VIEW_INVALID');
      this.#map = new api.Map({
        container,
        center: [...geographic],
        zoom,
        bearing: (-rotation * 180) / Math.PI,
        minZoom: -24,
        maxZoom: 32,
        minPitch: 0,
        maxPitch: 0,
        pitch: 0,
        attributionControl: false,
        keyboard: false,
        dragRotate: false,
        touchZoomRotate: true,
        renderWorldCopies: false,
        trackResize: false,
        fadeDuration: 0,
        style: { version: 8, sources: {}, layers: [] }
      });
      this.#map.touchZoomRotate.disableRotation();
      this.#map.touchPitch.disable();
      const map = this.#map;
      await new Promise<void>((resolve, reject) => {
        const loaded = () => {
          cleanup();
          resolve();
        };
        const failed = () => {
          cleanup();
          reject(
            new MapError('ENGINE_STATE', {
              reason: 'MapLibre could not initialise its WebGL renderer.'
            })
          );
        };
        const aborted = () => {
          cleanup();
          reject(new MapError('ENGINE_MOUNT_ABORTED'));
        };
        const cleanup = () => {
          map.off('load', loaded);
          map.off('error', failed);
          map.off('remove', aborted);
        };
        map.on('load', loaded);
        map.on('error', failed);
        map.on('remove', aborted);
      });
      if (this.destroyed || init.signal?.aborted)
        throw new MapError('ENGINE_MOUNT_ABORTED');
      // MapContainer owns the one keyboard focus stop and accessible canvas label.
      map.getCanvas().removeAttribute('tabindex');
      map.getCanvas().setAttribute('aria-hidden', 'true');
      const changed = () => this.changed();
      map.on('moveend', changed);
      this.cleanups.push(() => map.off('moveend', changed));
      const failed = (event: import('maplibre-gl').ErrorEvent) => {
        const sourceId = 'sourceId' in event ? event.sourceId : undefined;
        const id = [...this.#layers].find(([, entry]) =>
          entry.ids[0]?.startsWith(`${sourceId}-`)
        )?.[0];
        if (id)
          this.emit(
            'error',
            new MapError('LAYER_LOAD_FAILED', {
              id,
              reason:
                'A raster tile could not be loaded. Check the tile service and toggle the layer to retry.'
            })
          );
      };
      map.on('error', failed);
      this.cleanups.push(() => map.off('error', failed));
      this.finish();
    } catch (cause) {
      this.destroy();
      throw cause;
    }
  }
  #zoom(resolution: number): number {
    const zoom = Math.log2(baseResolution / resolution);
    if (!Number.isFinite(zoom) || zoom < -24 || zoom > 32)
      throw new MapError('VIEW_INVALID', {
        reason: 'Resolution is outside MapLibre adapter limits.'
      });
    return zoom;
  }
  getView(): ViewState {
    const map = this.#get(),
      center = map.getCenter();
    const resolution = baseResolution / 2 ** map.getZoom();
    const corners = [
      [0, 0],
      [this.container!.clientWidth, 0],
      [0, this.container!.clientHeight],
      [this.container!.clientWidth, this.container!.clientHeight]
    ].map(([x, y]) => this.pixelToCoord([x, y]));
    return {
      center: project([center.lng, center.lat]),
      resolution,
      zoom: this.definition?.tileMatrix
        ? resolutionToZoom(resolution, this.definition.tileMatrix)
        : undefined,
      rotation: (-map.getBearing() * Math.PI) / 180,
      extent: [
        Math.min(...corners.map((p) => p[0])),
        Math.min(...corners.map((p) => p[1])),
        Math.max(...corners.map((p) => p[0])),
        Math.max(...corners.map((p) => p[1]))
      ]
    };
  }
  setView(
    view: Partial<ViewState>,
    options: { animate?: boolean; source?: 'api' | 'user' } = {}
  ): void {
    const current = this.getView();
    const center = view.center ?? current.center,
      rotation = view.rotation ?? current.rotation;
    if (!center.every(Number.isFinite) || !Number.isFinite(rotation))
      throw new MapError('VIEW_INVALID');
    const geographic = unproject(center);
    project(geographic);
    const resolution =
      view.resolution !== undefined || view.zoom !== undefined
        ? resolveViewResolution(view, this.definition?.tileMatrix)
        : current.resolution;
    const next = {
      center: [...geographic] as [number, number],
      zoom: this.#zoom(resolution),
      bearing: (-rotation * 180) / Math.PI
    };
    this.source = options.source ?? 'api';
    if (
      options.animate &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      this.#get().easeTo({ ...next, duration: 200 });
    else this.#get().jumpTo(next);
  }
  // With pitch fixed to zero, use the native camera's affine Mercator plane.
  // This avoids geographic round trips losing sub-pixel precision at high zoom.
  #plane() {
    const map = this.#get(),
      geographic = map.getCenter();
    const center = project([geographic.lng, geographic.lat]);
    const resolution = baseResolution / 2 ** map.getZoom();
    const angle = (-map.getBearing() * Math.PI) / 180;
    return { center, resolution, c: Math.cos(angle), s: Math.sin(angle) };
  }
  pixelToCoord(pixel: Coord): Coord {
    const { center, resolution, c, s } = this.#plane();
    const x = (pixel[0] - this.container!.clientWidth / 2) * resolution;
    const y = (pixel[1] - this.container!.clientHeight / 2) * resolution;
    return [center[0] + x * c + y * s, center[1] + x * s - y * c];
  }
  coordToPixel(coord: Coord): Coord {
    const { center, resolution, c, s } = this.#plane();
    const x = (coord[0] - center[0]) / resolution,
      y = (coord[1] - center[1]) / resolution;
    return [
      this.container!.clientWidth / 2 + x * c + y * s,
      this.container!.clientHeight / 2 + x * s - y * c
    ];
  }
  protected featureCoord(coord: Coord): Coord {
    return project(coord);
  }
  resize(): void {
    this.#get().resize();
    this.emit('resize', {
      width: this.container!.clientWidth,
      height: this.container!.clientHeight
    });
  }
  protected navigation(gesture: NavigationGesture) {
    const map = this.#get();
    const handler = {
      dragPan: map.dragPan,
      dblClickZoom: map.doubleClickZoom,
      boxZoom: map.boxZoom,
      keyboard: undefined
    }[gesture];
    return handler
      ? {
          enabled: () => handler.isEnabled(),
          enable: () => handler.enable(),
          disable: () => handler.disable()
        }
      : undefined;
  }
  #reorder(): void {
    for (const entry of [...this.#layers.values()].sort(
      (a, b) => a.order - b.order
    ))
      for (const id of entry.ids) this.#get().moveLayer(id);
  }
  protected featureLayer(input: ResolvedLayer, sketch: boolean): LayerHandle {
    const map = this.#get(),
      sourceId = `cii-${++this.#sequence}`;
    // Renderer inputs are geographic; sketch inputs are display coordinates.
    const data = (batch: FeatureBatch): GeoJSONSourceSpecification['data'] => {
      if (!sketch) return batch as GeoJSONSourceSpecification['data'];
      const convert = (value: unknown): unknown =>
        Array.isArray(value)
          ? typeof value[0] === 'number'
            ? [...unproject([value[0], value[1]]), ...value.slice(2)]
            : value.map(convert)
          : value;
      const geometry = (
        value: import('./engine/types.ts').Geometry
      ): unknown =>
        value.type === 'GeometryCollection'
          ? { type: value.type, geometries: value.geometries.map(geometry) }
          : { type: value.type, coordinates: convert(value.coordinates) };
      return {
        type: 'FeatureCollection',
        features: batch.features.map((feature) => ({
          ...feature,
          geometry: feature.geometry ? geometry(feature.geometry) : null
        }))
      } as GeoJSONSourceSpecification['data'];
    };
    map.addSource(sourceId, {
      type: 'geojson',
      data: data(input.data as FeatureBatch),
      maxzoom: 24
    });
    const ids = ['fill', 'line', 'point'].map((kind) => `${sourceId}-${kind}`);
    let style = input.style,
      opacity = input.opacity;
    const paint = (value?: PortableStyle): LayerSpecification[] => [
      {
        id: ids[0],
        type: 'fill',
        source: sourceId,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: {
          'fill-color': this.color(value?.fill?.color),
          'fill-opacity': opacity * (value?.fill?.opacity ?? 0.2)
        }
      },
      {
        id: ids[1],
        type: 'line',
        source: sourceId,
        filter: ['!=', ['geometry-type'], 'Point'],
        paint: {
          'line-color': this.color(value?.stroke?.color),
          'line-width': value?.stroke?.width ?? 2,
          'line-opacity': opacity * (value?.stroke?.opacity ?? 1),
          'line-dasharray': value?.stroke?.dash
            ? value.stroke.dash.map(
                (length) => length / (value.stroke?.width || 2)
              )
            : [1, 0]
        }
      },
      {
        id: ids[2],
        type: 'circle',
        source: sourceId,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': (value?.point?.size ?? 10) / 2,
          'circle-color': this.color(value?.fill?.color),
          'circle-opacity': opacity * (value?.fill?.opacity ?? 0.2),
          'circle-stroke-color': this.color(value?.stroke?.color),
          'circle-stroke-width': value?.stroke?.width ?? 2,
          'circle-stroke-opacity': opacity * (value?.stroke?.opacity ?? 1)
        }
      }
    ];
    try {
      for (const layer of paint(style))
        map.addLayer({
          ...layer,
          layout: { visibility: input.visible ? 'visible' : 'none' }
        });
    } catch (cause) {
      for (const id of ids) if (map.getLayer(id)) map.removeLayer(id);
      map.removeSource(sourceId);
      throw cause;
    }
    const entry = { ids, order: input.order };
    this.#layers.set(input.id, entry);
    this.#reorder();
    const restyle = (value?: PortableStyle) => {
      const next = paint(value);
      for (const layer of next)
        for (const [name, value] of Object.entries(layer.paint ?? {}) as [
          Parameters<MapLibreMap['setPaintProperty']>[1],
          Parameters<MapLibreMap['setPaintProperty']>[2]
        ][])
          map.setPaintProperty(layer.id, name, value);
      style = value;
    };
    return {
      setVisible: (visible) => {
        for (const id of ids)
          map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
      },
      setOpacity: (value) => {
        opacity = value;
        restyle(style);
      },
      setOrder: (order) => {
        entry.order = order;
        this.#reorder();
      },
      setStyle: restyle,
      setData: (batch) =>
        (map.getSource(sourceId) as GeoJSONSource).setData(data(batch)),
      remove: () => {
        this.#layers.delete(input.id);
        for (const id of ids) map.removeLayer(id);
        map.removeSource(sourceId);
      }
    };
  }
  protected rasterLayer(input: ResolvedLayer): LayerHandle {
    const map = this.#get(),
      sourceId = `cii-${++this.#sequence}`,
      id = `${sourceId}-raster`;
    const tiles = input.data as { url: string } | OgcTileData;
    const service = 'kind' in tiles ? tiles : undefined;
    if (service?.kind !== 'wms' && input.sourceCrs.crs.code !== 'EPSG:3857')
      throw new MapError('LAYER_INCOMPATIBLE', { id: input.id });
    if (service?.kind === 'wmts') assertWmtsLeafletGrid(service);
    else if (service?.kind === 'wms') {
      if (service.requestCrs !== 'EPSG:3857')
        throw new MapError('LAYER_INCOMPATIBLE');
    } else assertXyzTileData(tiles);
    this.#tileUrls.set(sourceId, (z, x, y) =>
      service
        ? ogcTileUrl(service, { z, x, y })
        : tiles.url
            .replace('{z}', String(z))
            .replace('{x}', String(x))
            .replace('{y}', String(y))
    );
    try {
      map.addSource(sourceId, {
        type: 'raster',
        tiles: [`${this.#protocol}://${sourceId}/{z}/{x}/{y}`],
        tileSize: 256,
        minzoom: service?.kind === 'wmts' ? service.matrices[0].zoom! : 0,
        maxzoom: service?.kind === 'wmts' ? service.matrices.at(-1)!.zoom! : 24
      });
      map.addLayer({
        id,
        type: 'raster',
        source: sourceId,
        layout: { visibility: input.visible ? 'visible' : 'none' },
        paint: { 'raster-opacity': input.opacity, 'raster-fade-duration': 0 }
      });
    } catch (cause) {
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      this.#tileUrls.delete(sourceId);
      throw cause;
    }
    const entry = { ids: [id], order: input.order };
    this.#layers.set(input.id, entry);
    this.#reorder();
    return {
      setVisible: (visible) => {
        map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
        if (visible) map.refreshTiles(sourceId);
      },
      setOpacity: (opacity) =>
        map.setPaintProperty(id, 'raster-opacity', opacity),
      setOrder: (order) => {
        entry.order = order;
        this.#reorder();
      },
      setStyle: () => {},
      remove: () => {
        this.#layers.delete(input.id);
        map.removeLayer(id);
        map.removeSource(sourceId);
        this.#tileUrls.delete(sourceId);
      }
    };
  }
  native<T = unknown>(): T {
    return this.#get() as unknown as T;
  }
  protected disposeNative(): void {
    this.#map?.remove();
    this.#map = undefined;
    this.#api?.removeProtocol(this.#protocol);
    this.#tileUrls.clear();
    this.#layers.clear();
  }
}
function blankTile(): ArrayBuffer {
  const bytes = atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNgAAIAAAUAAarVyFEAAAAASUVORK5CYII='
  );
  return Uint8Array.from(bytes, (value) => value.charCodeAt(0)).buffer;
}
