import type Map from 'ol/Map.js';
import type Projection from 'ol/proj/Projection.js';
import type { Coordinate } from 'ol/coordinate.js';
import { BrowserEngine } from './engine/browser-engine.ts';
import { assertDisplayCrs } from './engine/registry.ts';
import { MapError } from './errors.ts';
import { resolveViewResolution, resolutionToZoom } from './view.ts';
import { ogcTileUrl, wmsTileUrl } from './sources/ogc-raster.ts';
import type { OgcTileData } from './sources/ogc-raster.ts';
import type { CrsDef, Coord } from './crs/types.ts';
import type { PreparedTransform } from './crs/transform-types.ts';
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

export interface OpenLayersRasterData {
  tiles: { url: string } | OgcTileData;
  definition: CrsDef;
  forward: PreparedTransform;
  inverse: PreparedTransform;
}
let sequence = 0;

/** Lazy native OpenLayers adapter. Core transforms features before they enter OL. */
export default class OpenLayersEngine extends BrowserEngine {
  readonly id = 'openlayers';
  readonly capabilities: EngineCapabilities = {
    // Registered definitions are validated by the core transform service before mount.
    displayCrs: () => 'native',
    renderKinds: new Set(['features', 'raster-tiles']),
    rasterReprojection: true,
    rotation: true,
    styleFeatures: new Set(['dash'])
  };
  #api?: typeof import('./engine/openlayers-api.ts');
  #map?: Map;
  #projection?: Projection;
  #alias = `cii-openlayers-${++sequence}`;
  #projectionSequence = 0;
  #get(): Map {
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
      const api = await import('./engine/openlayers-api.ts');
      if (this.destroyed || init.signal?.aborted)
        throw new MapError('ENGINE_MOUNT_ABORTED');
      this.#api = api;
      const definition = this.definition!;
      this.#projection = new api.Projection({
        code: this.#alias,
        units: definition.units === 'metres' ? 'm' : 'degrees',
        global: false
      });
      const resolution = resolveViewResolution(
        {
          resolution: init.view?.resolution,
          zoom:
            init.view?.zoom ??
            (init.view?.resolution === undefined && definition.tileMatrix
              ? 0
              : undefined)
        },
        definition.tileMatrix
      );
      const center = init.view?.center ?? [0, 0];
      const rotation = init.view?.rotation ?? 0;
      if (!center.every(Number.isFinite) || !Number.isFinite(rotation))
        throw new MapError('VIEW_INVALID');
      this.#map = new api.Map({
        target: container,
        controls: [],
        interactions: api
          .interactions({
            dragPan: false,
            zoomDuration: 0,
            keyboard: false,
            altShiftDragRotate: false,
            pinchRotate: true,
            onFocusOnly: true
          })
          .extend([new api.DragPan({ onFocusOnly: true })]),
        view: new api.View({
          projection: this.#projection,
          center: [...center],
          resolution,
          rotation,
          constrainResolution: false,
          constrainOnlyCenter: true,
          smoothResolutionConstraint: false,
          // OL's default resolution limits derive from a world extent. Explicit bounds
          // retain the core's display-units contract for local projected coordinates.
          minResolution: 1e-10,
          maxResolution: 1e12,
          enableRotation: true
        })
      });
      const changed = () => this.changed();
      this.#map.getView().on('change', changed);
      this.cleanups.push(() => this.#map?.getView().un('change', changed));
      this.finish();
    } catch (cause) {
      this.destroy();
      throw cause;
    }
  }
  getView(): ViewState {
    const map = this.#get(),
      view = map.getView();
    const center = view.getCenter()!,
      resolution = view.getResolution()!;
    const extent = view.calculateExtent(map.getSize());
    return {
      center: [center[0], center[1]],
      resolution,
      rotation: view.getRotation(),
      extent: [extent[0], extent[1], extent[2], extent[3]],
      zoom: this.definition?.tileMatrix
        ? resolutionToZoom(resolution, this.definition.tileMatrix)
        : undefined
    };
  }
  setView(
    view: Partial<ViewState>,
    options: { animate?: boolean; source?: 'api' | 'user' } = {}
  ): void {
    const current = this.getView();
    const center = view.center ?? current.center,
      rotation = view.rotation ?? current.rotation;
    const resolution =
      view.resolution !== undefined || view.zoom !== undefined
        ? resolveViewResolution(view, this.definition?.tileMatrix)
        : current.resolution;
    if (
      center.length !== 2 ||
      !center.every(Number.isFinite) ||
      !Number.isFinite(rotation)
    )
      throw new MapError('VIEW_INVALID');
    this.source = options.source ?? 'api';
    const native = this.#get().getView();
    native.cancelAnimations();
    if (
      options.animate &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      native.animate({
        center: [...center],
        resolution,
        rotation,
        duration: 200
      });
    else {
      native.setCenter([...center]);
      native.setResolution(resolution);
      native.setRotation(rotation);
    }
    this.#get().renderSync();
  }
  pixelToCoord(pixel: Coord): Coord {
    const value = this.#get().getCoordinateFromPixel([...pixel]);
    if (!value) throw new MapError('VIEW_INVALID');
    return [value[0], value[1]];
  }
  coordToPixel(coord: Coord): Coord {
    const value = this.#get().getPixelFromCoordinate([...coord]);
    if (!value) throw new MapError('VIEW_INVALID');
    return [value[0], value[1]];
  }
  resize(): void {
    const map = this.#get();
    map.updateSize();
    map.renderSync();
    const size = map.getSize() ?? [0, 0];
    this.emit('resize', { width: size[0], height: size[1] });
  }
  protected navigation(gesture: NavigationGesture) {
    const api = this.#api!;
    const constructor = {
      dragPan: api.DragPan,
      dblClickZoom: api.DoubleClickZoom,
      boxZoom: api.DragZoom,
      keyboard: undefined
    }[gesture];
    const interaction = constructor
      ? this.#get()
          .getInteractions()
          .getArray()
          .find((item) => item instanceof constructor)
      : undefined;
    return interaction
      ? {
          enabled: () => interaction.getActive(),
          enable: () => interaction.setActive(true),
          disable: () => interaction.setActive(false)
        }
      : undefined;
  }
  protected featureLayer(input: ResolvedLayer, _sketch: boolean): LayerHandle {
    const api = this.#api!,
      map = this.#get();
    const format = new api.GeoJSON();
    const source = new api.VectorSource({
      features: format.readFeatures(input.data),
      wrapX: false
    });
    let style = input.style;
    const makeStyle = (value?: PortableStyle) => {
      const stroke = new api.Stroke({
        color: this.color(value?.stroke?.color),
        width: value?.stroke?.width ?? 2,
        lineDash: value?.stroke?.dash ? [...value.stroke.dash] : undefined
      });
      // Separate native styles preserve independent stroke and fill opacity.
      const strokeColor = apiColor(
        api.asArray(this.color(value?.stroke?.color)),
        value?.stroke?.opacity ?? 1
      );
      const fillColor = apiColor(
        api.asArray(this.color(value?.fill?.color)),
        value?.fill?.opacity ?? 0.2
      );
      stroke.setColor(strokeColor);
      const fill = new api.Fill({ color: fillColor });
      return new api.Style({
        stroke,
        fill,
        image: new api.CircleStyle({
          radius: (value?.point?.size ?? 10) / 2,
          stroke,
          fill
        })
      });
    };
    const layer = new api.VectorLayer({
      source,
      style: makeStyle(style),
      visible: input.visible,
      opacity: input.opacity,
      zIndex: input.order
    });
    map.addLayer(layer);
    return {
      setVisible: (visible) => layer.setVisible(visible),
      setOpacity: (opacity) => layer.setOpacity(opacity),
      setOrder: (order) => layer.setZIndex(order),
      setStyle: (value) => {
        const next = makeStyle(value);
        style = value;
        layer.setStyle(next);
      },
      setData: (data: FeatureBatch) => {
        const next = format.readFeatures(data);
        source.clear();
        source.addFeatures(next);
      },
      remove: () => {
        map.removeLayer(layer);
        source.clear();
        source.dispose();
        layer.dispose();
      }
    };
  }
  protected rasterLayer(input: ResolvedLayer): LayerHandle {
    const api = this.#api!,
      map = this.#get();
    const { tiles, definition, forward, inverse } =
      input.data as OpenLayersRasterData;
    if (!definition || !forward || !inverse)
      throw new MapError('LAYER_INCOMPATIBLE', { id: input.id });
    const projection = new api.Projection({
      code: `${this.#alias}-source-${++this.#projectionSequence}`,
      units: definition.units === 'metres' ? 'm' : 'degrees',
      global: false
    });
    const convert =
      (transform: PreparedTransform) =>
      (value: Coordinate): Coordinate => {
        try {
          return [...transform.coordinate([value[0], value[1]])];
        } catch {
          return [NaN, NaN];
        }
      };
    api.addCoordinateTransforms(
      projection,
      this.#projection!,
      convert(forward),
      convert(inverse)
    );
    const service = 'kind' in tiles ? tiles : undefined;
    const wmts =
      service?.kind === 'wmts'
        ? {
            ...service,
            matrices: service.matrices.map((matrix, zoom) => ({
              ...matrix,
              zoom
            }))
          }
        : undefined;
    const matrix = definition.tileMatrix;
    const resolutions = wmts
      ? wmts.matrices.map(
          (level) =>
            (level.scale * 0.00028) /
            (definition.units === 'degrees' ? 111319.49079327358 : 1)
        )
      : (matrix?.resolutions ??
        Array.from(
          { length: 25 },
          (_, zoom) =>
            (definition.units === 'degrees' ? 180 / 256 : 65536) / 2 ** zoom
        ));
    const origin = wmts
      ? input.sourceCrs.crs.axisOrder === 'yx'
        ? [wmts.matrices[0].origin[1], wmts.matrices[0].origin[0]]
        : wmts.matrices[0].origin
      : (matrix?.origin ??
        (definition.units === 'degrees' ? [-180, 90] : [0, 10_000_000]));
    const grid = new api.TileGrid({
      origin: [...origin],
      resolutions: [...resolutions],
      tileSizes: wmts?.matrices.map((level) => [
        level.tileWidth,
        level.tileHeight
      ]),
      tileSize: wmts ? undefined : 256
    });
    const source = new api.XYZ({
      projection,
      tileGrid: grid,
      wrapX: false,
      transition: 0,
      tileUrlFunction: (coord) => {
        const [z, x, y] = coord;
        if (wmts) return ogcTileUrl(wmts, { z, x, y }) ?? undefined;
        if (service?.kind === 'wms') {
          const extent = grid.getTileCoordExtent(coord);
          return wmsTileUrl(
            service,
            [extent[0], extent[1], extent[2], extent[3]],
            256,
            256
          );
        }
        if (z < 0 || z > 24 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z)
          return undefined;
        return tiles.url
          .replace('{z}', String(z))
          .replace('{x}', String(x))
          .replace('{y}', String(y));
      }
    });
    const layer = new api.TileLayer({
      source,
      visible: input.visible,
      opacity: input.opacity,
      zIndex: input.order
    });
    const failed = () =>
      this.emit(
        'error',
        new MapError('LAYER_LOAD_FAILED', {
          id: input.id,
          reason:
            'A raster tile could not be loaded. Check the tile service and toggle the layer to retry.'
        })
      );
    source.on('tileloaderror', failed);
    map.addLayer(layer);
    return {
      setVisible: (visible) => {
        if (visible) source.refresh();
        layer.setVisible(visible);
      },
      setOpacity: (opacity) => layer.setOpacity(opacity),
      setOrder: (order) => layer.setZIndex(order),
      setStyle: () => {},
      remove: () => {
        map.removeLayer(layer);
        source.un('tileloaderror', failed);
        source.dispose();
        layer.dispose();
        api.removeTransform(projection, this.#projection!);
        api.removeTransform(this.#projection!, projection);
      }
    };
  }
  native<T = unknown>(): T {
    return this.#get() as unknown as T;
  }
  protected disposeNative(): void {
    this.#map?.setTarget(undefined);
    this.#map?.dispose();
    this.#map = undefined;
  }
}

/** Copy OL's cached colour; never change a shared token or another layer's alpha. */
function apiColor(color: number[], opacity: number): number[] {
  return [color[0], color[1], color[2], (color[3] ?? 1) * opacity];
}
