import { assertWmtsLeafletGrid } from './sources/ogc-raster.ts';
import type { OgcTileData } from './sources/ogc-raster.ts';
import { assertXyzTileData } from './sources/xyz.ts';
import { assertDisplayCrs } from './engine/registry.ts';
import { createRegistries } from './extensions/registries.ts';
import { createTransformService } from './crs/transform.ts';
import { createCrsAcknowledgements } from './crs/acknowledgements.ts';
import { resolveSourceCrs } from './crs/resolve.ts';
import { LayerManager } from './layers/manager.ts';
import { layerIdentityKey } from './layers/compatibility.ts';
import { validateMapConfig } from './config/index.ts';
import { resolveViewResolution } from './view.ts';
import { MapError } from './errors.ts';
import { assertLeafletStyle } from './engine/leaflet-style.ts';
import type { ResolvedMapConfig } from './config/index.ts';
import type {
  FeatureBatch,
  IMapEngine,
  PortableStyle
} from './engine/types.ts';
import type { LayerSpec, ManagedLayer } from './layers/types.ts';
import type { TransformAccuracy } from './crs/transform-types.ts';
import type { ConfirmedCrs } from './crs/types.ts';
import type { ViewState } from './view.ts';

export function createLeafletRuntime(
  options: { fetch?: typeof fetch; acknowledgeHintMismatch?: boolean } = {}
) {
  const registries = createRegistries(options);
  const { crs, engines, sources, renderers } = registries;
  const transforms = createTransformService(crs);
  engines.register('leaflet', () => import('./leaflet.ts'));
  renderers.register('leaflet:features', {
    compatibility: () => undefined,
    prepare: async (source, context) => {
      const batch = source.data as FeatureBatch;
      // Check the display operation for singularities, but generate Leaflet input from
      // original coordinates, never by inverse-transforming a display copy.
      const display = await transforms.forDisplay(
        source.crs,
        context.displayCrs.code
      );
      display.features(batch);
      const geographic = await transforms.prepare({
        source: source.crs.crs.code,
        target: context.displayCrs.geographicBase
      });
      const data = geographic.features(batch);
      if (context.displayCrs.code === 'EPSG:3857') {
        // Reject Leaflet's latitude clipping instead of silently moving polar features.
        const guard = (
          geometry: NonNullable<FeatureBatch['features'][number]['geometry']>
        ): void => {
          if (geometry.type === 'GeometryCollection') {
            geometry.geometries.forEach(guard);
            return;
          }
          const positions = (value: unknown): void => {
            if (!Array.isArray(value)) return;
            if (typeof value[0] === 'number') {
              if (Math.abs(value[1]) > 85.0511287798066)
                throw new MapError('LAYER_INCOMPATIBLE', {
                  reason:
                    'Feature lies outside the Leaflet Web Mercator latitude range.'
                });
            } else value.forEach(positions);
          };
          positions(geometry.coordinates);
        };
        for (const feature of data.features)
          if (feature.geometry) guard(feature.geometry);
      }
      context.signal.throwIfAborted();
      return { data };
    }
  });
  renderers.register('leaflet:raster-tiles', {
    compatibility: (source) =>
      ['xyz', 'wms', 'wmts'].includes(source.provider)
        ? undefined
        : 'Only XYZ, WMS and WMTS raster tiles are implemented.',
    prepare: (source, context) => {
      context.signal.throwIfAborted();
      if (source.provider === 'xyz') {
        assertXyzTileData(source.data);
        return { data: source.data };
      }
      const data = source.data as OgcTileData;
      if (data.kind === 'wmts') {
        assertWmtsLeafletGrid(data);
        return { data };
      }
      const code = context.displayCrs.code;
      if (!data.supportedCrs.includes(code))
        throw new MapError('LAYER_INCOMPATIBLE', {
          reason: 'WMS does not advertise the display CRS.'
        });
      return {
        data: {
          ...data,
          requestCrs: code,
          axisOrder:
            data.version === '1.3.0' &&
            code !== 'OGC:CRS84' &&
            !context.displayCrs.projected
              ? 'yx'
              : 'xy'
        } satisfies OgcTileData
      };
    }
  });
  return {
    ...registries,
    ...createCrsAcknowledgements(),
    transforms,
    acknowledgeHintMismatch: options.acknowledgeHintMismatch ?? false
  };
}

export type MapRuntime = ReturnType<typeof createLeafletRuntime>;
export interface MapLayerInfo {
  id: string;
  crs: ConfirmedCrs;
  accuracy: TransformAccuracy;
  visible: boolean;
  count: number | null;
  opacity: number;
  order: number;
}
export interface MapSnapshot {
  ready: boolean;
  engine: IMapEngine | null;
  view: ViewState | null;
  layers: readonly MapLayerInfo[];
  layerErrors: readonly { id: string; error: MapError }[];
  attributions: readonly string[];
  showZoom: boolean;
  showLayerList: boolean;
}
interface RecordEntry {
  key: string;
  spec: LayerSpec;
  managed: ManagedLayer;
  accuracy: TransformAccuracy;
}
export interface MapControllerCallbacks {
  onstate?: (snapshot: MapSnapshot) => void;
  onready?: (engine: IMapEngine) => void;
  onlayererror?: (error: MapError) => void;
  onviewchange?: (view: ViewState, source: 'api' | 'user') => void;
}

/** Browser lifecycle coordinator for read-only Leaflet feature and XYZ layers. */
export class MapController {
  readonly layers: LayerManager;
  #node: HTMLElement;
  #runtime: MapRuntime;
  #callbacks: MapControllerCallbacks;
  #engine?: IMapEngine;
  #mounting?: IMapEngine;
  #lifetime = new AbortController();
  #preparing?: AbortController;
  #generation = 0;
  #tail: Promise<void> = Promise.resolve();
  #records = new Map<string, RecordEntry>();
  #layerErrors = new Map<string, MapError>();
  #config?: ResolvedMapConfig;
  #ready = false;
  #notified = false;
  #offView?: () => void;
  #offError?: () => void;
  constructor(
    node: HTMLElement,
    runtime: MapRuntime,
    callbacks: MapControllerCallbacks = {}
  ) {
    this.#node = node;
    this.#runtime = runtime;
    this.#callbacks = callbacks;
    this.layers = new LayerManager({ renderers: runtime.renderers });
  }
  get engine(): IMapEngine | null {
    return this.#engine ?? null;
  }
  snapshot(): MapSnapshot {
    return {
      ready: this.#ready,
      engine: this.engine,
      view: this.#engine?.getView() ?? null,
      layers: [...this.#records].map(([id, entry]) => ({
        id,
        crs: entry.spec.source.crs,
        accuracy: entry.accuracy,
        visible: entry.spec.visible ?? true,
        opacity: entry.spec.opacity ?? 1,
        order: entry.spec.order ?? 0,
        count:
          entry.spec.source.renderKind === 'features'
            ? (entry.spec.source.data as FeatureBatch).features.length
            : null
      })),
      layerErrors: [...this.#layerErrors].map(([id, error]) => ({ id, error })),
      attributions: [
        ...new Set(
          [...this.#records.values()]
            .filter((entry) => entry.spec.visible !== false)
            .flatMap((entry) =>
              entry.spec.attribution ? [entry.spec.attribution] : []
            )
        )
      ],
      showLayerList:
        this.#config?.controls?.some(
          (control) => control.id === 'layer-list'
        ) ?? false,
      showZoom:
        this.#config?.controls?.some((control) => control.id === 'zoom') ?? true
    };
  }
  #emit(): void {
    if (!this.#lifetime.signal.aborted)
      this.#callbacks.onstate?.(this.snapshot());
  }

  #removeLayer(id: string): void {
    try {
      // The manager owns registrations, including any created before bookkeeping
      // completed. Always clear our record even if engine cleanup throws.
      this.layers.get(id)?.remove();
    } finally {
      this.#records.delete(id);
    }
  }

  async applyConfig(input: unknown): Promise<void> {
    this.#preparing?.abort();
    const preparing = new AbortController();
    this.#preparing = preparing;
    const generation = ++this.#generation;
    const current = () =>
      !this.#lifetime.signal.aborted && generation === this.#generation;
    let candidate: IMapEngine | undefined;
    try {
      const validated = validateMapConfig(input);
      if (!validated.ok) throw validated.error;
      const config = validated.value;
      if (
        config.capture ||
        config.layers.some((layer) => layer.editable) ||
        config.controls?.some(
          (control) =>
            !['zoom', 'attribution', 'layer-list'].includes(control.id) ||
            (control.position &&
              control.position !==
                (control.id === 'zoom'
                  ? 'top-left'
                  : control.id === 'layer-list'
                    ? 'top-right'
                    : 'bottom-right'))
        ) ||
        [
          config.view.minZoom,
          config.view.maxZoom,
          config.view.minResolution,
          config.view.maxResolution
        ].some((value) => value !== undefined)
      )
        throw new MapError('CONFIG_INVALID', {
          reason:
            'This slice supports read-only features, XYZ/WMS/WMTS tiles, zoom, attribution and layer list; other controls and view limits are not yet supported.'
        });
      if (
        this.#config &&
        (config.engine !== this.#config.engine ||
          config.display.crs !== this.#config.display.crs)
      )
        throw new MapError('DISPLAY_CRS_SWITCH_BLOCKED', {
          reason:
            'Remount MapContainer to change engine or display CRS in this slice.'
        });
      const definition = await this.#runtime.crs.resolve(config.display.crs);
      candidate = this.#engine
        ? undefined
        : await this.#runtime.engines.create(config.engine);
      if (!current()) return;
      assertDisplayCrs(
        (this.#engine ?? candidate)!.capabilities,
        definition.code,
        config.display.allowExperimental
      );
      const centerTransform = await this.#runtime.transforms.prepare({
        source: config.view.center.crs,
        target: definition.code
      });
      const view = {
        center: centerTransform.coordinate(config.view.center.coordinates),
        resolution: resolveViewResolution(config.view, definition.tileMatrix),
        rotation: config.view.rotation ?? 0
      };
      const commit = this.#tail.then(async () => {
        if (!current()) return;
        if (!this.#engine) {
          this.#mounting = candidate;
          await candidate!.mount(this.#node, {
            displayCrs: definition,
            view,
            signal: this.#lifetime.signal,
            allowExperimental: config.display.allowExperimental
          });
          if (!current()) return;
          this.#engine = candidate;
          candidate = undefined;
          this.#mounting = undefined;
          this.#offError = this.#engine!.on('error', (error) => {
            const id = error.details.id;
            if (
              typeof id === 'string' &&
              this.#records.has(id) &&
              !this.#layerErrors.has(id)
            ) {
              this.#layerErrors.set(id, error);
              this.#emit();
              this.#callbacks.onlayererror?.(error);
            }
          });
          this.#offView = this.#engine!.on('viewchange', (event) => {
            this.#emit();
            this.#callbacks.onviewchange?.(event.view, event.source);
          });
        }
        // Drop removed/replaced sources before starting independent layer loads.
        for (const [id, entry] of this.#records) {
          const item = config.layers.find((layer) => layer.id === id);
          if (!item || entry.key !== JSON.stringify(item.source)) {
            this.#removeLayer(id);
          }
        }
        this.#layerErrors.clear();
        const move =
          !this.#config ||
          JSON.stringify(config.view) !== JSON.stringify(this.#config.view);
        this.#config = config;
        if (!this.layers.attached)
          await this.layers.attach(this.#engine!, definition, {
            allowExperimental: config.display.allowExperimental
          });
        if (!current()) return;
        if (move) this.#engine!.setView(view);
        this.#ready = true;
        this.#emit();
        if (!this.#notified) {
          this.#notified = true;
          this.#callbacks.onready?.(this.#engine!);
        }
      });
      this.#tail = commit.catch(() => {});
      await commit;
      if (!current()) return;
      // Source I/O is outside the mount queue: a stalled source cannot block a
      // sibling layer, readiness, or a newer configuration.
      await Promise.all(
        config.layers.map(async (item) => {
          try {
            const style: PortableStyle | undefined = item.style
              ? { ...item.style }
              : undefined;
            assertLeafletStyle(style);
            const key = JSON.stringify(item.source);
            const existing = this.#records.get(item.id);
            let source =
              existing?.key === key ? existing.spec.source : undefined;
            if (!source) {
              const provider = this.#runtime.sources.require(
                item.source.provider
              );
              const confirmed = await resolveSourceCrs(item.source, {
                sources: this.#runtime.sources,
                crsRegistry: this.#runtime.crs,
                displayCrs: definition.code,
                signal: preparing.signal,
                acknowledgeHintMismatch: this.#runtime.acknowledgeHintMismatch,
                hintMismatchAcknowledgement: this.#runtime.acknowledgementFor(
                  item.source
                )
              });
              if (!confirmed.ok) throw confirmed.error;
              source = await provider.open(item.source, confirmed.value, {
                signal: preparing.signal
              });
            }
            const accuracy = (
              await this.#runtime.transforms.forDisplay(
                source.crs,
                definition.code
              )
            ).accuracy;
            if (!current()) return;
            const spec: LayerSpec = {
              id: item.id,
              source,
              visible: item.visible,
              opacity: item.opacity,
              order: item.order ?? config.layers.indexOf(item),
              style,
              attribution: item.attribution
            };
            const old = this.#records.get(item.id);
            let managed: ManagedLayer;
            if (old && layerIdentityKey(old.spec) === layerIdentityKey(spec)) {
              managed = old.managed;
              managed.update(spec);
              if (managed.status === 'error') managed.reload();
            } else {
              this.#removeLayer(item.id);
              managed = this.layers.add(spec);
            }
            this.#records.set(item.id, { key, spec, accuracy, managed });
            await managed.ready;
            if (current()) this.#emit();
          } catch (cause) {
            if (!current()) return;
            const error =
              cause instanceof MapError
                ? new MapError(cause.code, { ...cause.details, id: item.id })
                : new MapError('LAYER_LOAD_FAILED', { id: item.id });
            this.#removeLayer(item.id);
            this.#layerErrors.set(item.id, error);
            this.#emit();
            this.#callbacks.onlayererror?.(error);
          }
        })
      );
    } catch (error) {
      if (!current()) return;
      if (error instanceof MapError) throw error;
      throw new MapError('SOURCE_LOAD_FAILED');
    } finally {
      candidate?.destroy();
      if (this.#mounting === candidate) this.#mounting = undefined;
    }
  }
  setView(view: Partial<ViewState>): void {
    if (!this.#engine) return;
    const current = this.#engine.getView();
    // Bound engine views include zoom; resolution remains authoritative when both are present.
    if (
      (!view.center ||
        view.center.every(
          (value, i) => Math.abs(value - current.center[i]) < 1e-7
        )) &&
      (view.resolution === undefined ||
        Math.abs(view.resolution - current.resolution) < 1e-9) &&
      (view.resolution !== undefined ||
        view.zoom === undefined ||
        view.zoom === current.zoom) &&
      (view.rotation === undefined || view.rotation === current.rotation)
    )
      return;
    this.#engine.setView(view);
  }
  updateLayer(
    id: string,
    patch: { visible?: boolean; opacity?: number; order?: number }
  ): void {
    const entry = this.#records.get(id);
    if (!entry) return;
    const spec = { ...entry.spec, ...patch };
    entry.managed.update(spec);
    entry.spec = spec;
    this.#layerErrors.delete(id);
    this.#emit();
  }
  zoom(delta: number): void {
    if (!this.#engine) return;
    const view = this.#engine.getView();
    this.#engine.setView(
      { resolution: view.resolution * 2 ** -delta },
      { source: 'user' }
    );
  }
  resize(): void {
    this.#engine?.resize();
  }
  destroy(): void {
    if (this.#lifetime.signal.aborted) return;
    this.#preparing?.abort();
    this.#lifetime.abort();
    this.#offView?.();
    this.#offError?.();
    try {
      this.layers.destroy();
    } finally {
      this.#engine?.destroy();
      this.#mounting?.destroy();
      this.#engine = undefined;
      this.#records.clear();
    }
  }
}
