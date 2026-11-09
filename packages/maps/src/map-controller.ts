import {
  createEngineHost,
  transformedDisplayView,
  waitForSwitch
} from './display-switch.ts';
import type { EngineHost } from './display-switch.ts';
import type { CrsDef } from './crs/types.ts';
import { ReadoutObserver } from './controls/readouts.ts';
import type { ReadoutSnapshot } from './controls/readouts.ts';
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
import { validateMapConfigSnapshot } from './config/snapshot.ts';
import type { MapConfigSnapshot } from './config/snapshot.ts';
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
  options: {
    fetch?: typeof fetch;
    acknowledgeHintMismatch?: boolean;
    definitions?: readonly CrsDef[];
  } = {}
) {
  const configured = structuredClone(options.definitions ?? []);
  const registries = createRegistries({ ...options, definitions: configured });
  const { crs, engines, sources, renderers } = registries;
  const transforms = createTransformService(crs);
  engines.register('leaflet', async () => {
    const { default: LeafletEngine } = await import('./leaflet.ts');
    return {
      default: class extends LeafletEngine {
        constructor() {
          super(crs, configured);
        }
      }
    };
  });
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

/** OpenLayers shares source confirmation and controls with the Leaflet runtime. */
export function createOpenLayersRuntime(
  options: Parameters<typeof createLeafletRuntime>[0] = {}
) {
  const runtime = createLeafletRuntime(options);
  const { transforms, crs, engines, renderers } = runtime;
  engines.register('openlayers', () => import('./openlayers.ts'));
  renderers.register('openlayers:features', {
    compatibility: () => undefined,
    prepare: async (source, context) => {
      const transform = await transforms.forDisplay(
        source.crs,
        context.displayCrs.code
      );
      context.signal.throwIfAborted();
      return { data: transform.features(source.data as FeatureBatch) };
    }
  });
  renderers.register('openlayers:raster-tiles', {
    compatibility: (source) =>
      ['xyz', 'wms', 'wmts'].includes(source.provider)
        ? undefined
        : 'Only XYZ, WMS and WMTS raster tiles are implemented.',
    prepare: async (source, context) => {
      let tiles =
        source.data as import('./openlayers.ts').OpenLayersRasterData['tiles'];
      let code = source.crs.crs.code;
      if ('kind' in tiles && tiles.kind === 'wms') {
        if (tiles.supportedCrs.includes(context.displayCrs.code))
          code = context.displayCrs.code;
        const definition = await crs.resolve(code);
        tiles = {
          ...tiles,
          requestCrs: code,
          axisOrder:
            tiles.version === '1.3.0' &&
            code !== 'OGC:CRS84' &&
            !definition.projected
              ? 'yx'
              : 'xy'
        };
      }
      const [definition, forward, inverse] = await Promise.all([
        crs.resolve(code),
        transforms.prepare({ source: code, target: context.displayCrs.code }),
        transforms.prepare({ source: context.displayCrs.code, target: code })
      ]);
      context.signal.throwIfAborted();
      return {
        data: {
          tiles,
          definition,
          forward,
          inverse
        } satisfies import('./openlayers.ts').OpenLayersRasterData
      };
    }
  });
  return runtime;
}

export function createMapLibreRuntime(
  options: Parameters<typeof createLeafletRuntime>[0] = {}
) {
  const runtime = createOpenLayersRuntime(options);
  runtime.engines.register('maplibre', () => import('./maplibre.ts'));
  // Both native renderers accept geographic x/y input. Share the Mercator
  // latitude guard so neither engine can silently clip a polar feature.
  runtime.renderers.register(
    'maplibre:features',
    runtime.renderers.require('leaflet:features')
  );
  // The production Web Mercator tile contract is identical to Leaflet's.
  runtime.renderers.register(
    'maplibre:raster-tiles',
    runtime.renderers.require('leaflet:raster-tiles')
  );
  return runtime;
}

/** Register all adapters lazily; only the selected engine is downloaded on mount. */
export const createMapRuntime = createMapLibreRuntime;

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
export interface DisplayCrsChange {
  previous: string;
  current: string;
  view: ViewState;
}
export interface MapSnapshot {
  displayCrs: string | null;
  switching: boolean;
  ready: boolean;
  engine: IMapEngine | null;
  view: ViewState | null;
  layers: readonly MapLayerInfo[];
  layerErrors: readonly { id: string; error: MapError }[];
  attributions: readonly string[];
  showZoom: boolean;
  showLayerList: boolean;
  readouts: ReadoutSnapshot | null;
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
  ondisplaycrschange?: (change: DisplayCrsChange) => void;
  onlayererror?: (error: MapError) => void;
  oncontrolerror?: (error: MapError) => void;
  onviewchange?: (view: ViewState, source: 'api' | 'user') => void;
}

/** Browser lifecycle coordinator shared by the registered display adapters. */
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
  #declarative = new Map<
    string,
    { managed: ManagedLayer; onerror?: (error: MapError) => void }
  >();
  #layerErrors = new Map<string, MapError>();
  #config?: ResolvedMapConfig;
  #ready = false;
  #notified = false;
  #offView?: () => void;
  #offError?: () => void;
  #readouts?: ReadoutObserver;
  #readoutState: ReadoutSnapshot | null = null;
  #readoutKey = '';
  #host?: EngineHost;
  #mountingHost?: EngineHost;
  #switchAbort?: AbortController;
  #switching = false;
  #request = 0;
  #pendingConfig?: symbol;
  #lastSwitchView?: ViewState;
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
  get host(): HTMLElement {
    return this.#host?.node ?? this.#node;
  }
  snapshot(): MapSnapshot {
    return {
      displayCrs: this.#config?.display.crs ?? null,
      switching: this.#switching,
      ready: this.#ready,
      readouts: this.#readoutState,
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
  /** Export the applied configuration and historical provenance, never engine resources. */
  exportSnapshot(): MapConfigSnapshot {
    if (
      !this.#config ||
      !this.#ready ||
      this.#pendingConfig ||
      this.#switching ||
      this.#lifetime.signal.aborted ||
      this.#layerErrors.size ||
      this.#records.size !==
        this.#config.layers.length + this.#declarative.size ||
      [...this.#records.values()].some(
        (entry) => entry.managed.status !== 'ready'
      )
    )
      throw new MapError('ENGINE_STATE', {
        reason:
          'Wait for all layers and configuration updates to finish before exporting.'
      });
    return validateMapConfigSnapshot({
      version: 1,
      config: this.#config,
      provenance: [...this.#records].map(([id, entry]) => ({
        id,
        origin: this.#declarative.has(id) ? 'declarative' : 'config',
        crs: entry.spec.source.crs
      }))
    });
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

  #assertConfig(config: ResolvedMapConfig): void {
    for (const layer of config.layers)
      if (this.#declarative.has(layer.id))
        throw new MapError('LAYER_DUPLICATE', { id: layer.id });
    if (
      config.capture ||
      (config.controls !== undefined &&
        new Set(config.controls.map((control) => control.id)).size !==
          config.controls.length) ||
      config.layers.some((layer) => layer.editable) ||
      config.controls?.some(
        (control) =>
          !['zoom', 'attribution', 'layer-list', 'scale', 'coords'].includes(
            control.id
          ) ||
          (control.readoutCrs !== undefined && control.id !== 'coords') ||
          (control.position &&
            control.position !==
              (control.id === 'scale'
                ? 'bottom-left'
                : control.id === 'zoom'
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
          'This slice supports read-only features, XYZ/WMS/WMTS tiles, zoom, attribution, layer list, scale and coordinates; other controls and view limits are not yet supported.'
      });
  }
  async applyConfig(input: unknown): Promise<void> {
    const pending = Symbol();
    this.#pendingConfig = pending;
    try {
      await this.#applyConfig(input);
    } finally {
      if (this.#pendingConfig === pending) this.#pendingConfig = undefined;
    }
  }

  async #applyConfig(input: unknown): Promise<void> {
    const validated = validateMapConfig(input);
    if (!validated.ok) throw validated.error;
    this.#assertConfig(validated.value);
    if (this.#config && validated.value.engine !== this.#config.engine)
      throw new MapError('CONFIG_INVALID', {
        reason: 'Remount MapContainer to change engines.'
      });
    const request = ++this.#request;
    this.#switchAbort?.abort();
    if (
      this.#config &&
      validated.value.display.crs !== this.#config.display.crs
    ) {
      await this.#switchDisplayCrs(validated.value, request);
      return;
    }
    this.#switchAbort = undefined;
    if (this.#switching) {
      this.#switching = false;
      this.#emit();
    }
    if (
      this.#config &&
      this.#ready &&
      !this.#layerErrors.size &&
      this.#records.size ===
        this.#config.layers.length + this.#declarative.size &&
      [...this.#records.values()].every(
        (entry) => entry.managed.status === 'ready'
      ) &&
      JSON.stringify(validated.value) === JSON.stringify(this.#config)
    )
      return;
    await this.#applyStableConfig(input, request);
  }

  async setDisplayCrs(code: string): Promise<void> {
    if (!this.#config) throw new MapError('ENGINE_STATE');
    await this.applyConfig({
      ...this.#config,
      display: { ...this.#config.display, crs: code }
    });
  }

  async #applyStableConfig(input: unknown, request: number): Promise<void> {
    this.#preparing?.abort();
    const preparing = new AbortController();
    this.#preparing = preparing;
    const generation = ++this.#generation;
    const current = () =>
      !this.#lifetime.signal.aborted && generation === this.#generation;
    let candidate: IMapEngine | undefined;
    let candidateHost: EngineHost | undefined;
    try {
      const validated = validateMapConfig(input);
      if (!validated.ok) throw validated.error;
      const config = validated.value;
      this.#assertConfig(config);
      if (this.#config && config.engine !== this.#config.engine)
        throw new MapError('CONFIG_INVALID', {
          reason: 'Remount MapContainer to change engines.'
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
      const move =
        !this.#config ||
        JSON.stringify(config.view) !== JSON.stringify(this.#config.view);
      const centerTransform = move
        ? await this.#runtime.transforms.prepare({
            source: config.view.center.crs,
            target: definition.code
          })
        : undefined;
      const view = move
        ? {
            center: centerTransform!.coordinate(config.view.center.coordinates),
            resolution: resolveViewResolution(
              config.view,
              definition.tileMatrix
            ),
            rotation: config.view.rotation ?? 0
          }
        : this.#engine!.getView();
      const scale =
        config.controls?.some((control) => control.id === 'scale') ?? false;
      const coords = config.controls?.find(
        (control) => control.id === 'coords'
      );
      let target = definition;
      let transform:
        Awaited<ReturnType<MapRuntime['transforms']['prepare']>> | undefined;
      try {
        if (coords) {
          target = await this.#runtime.crs.resolve(
            coords.readoutCrs ?? definition.code
          );
          transform = await this.#runtime.transforms.prepare({
            source: definition.code,
            target: target.code
          });
        }
      } catch (cause) {
        if (cause instanceof MapError)
          throw new MapError(cause.code, {
            ...cause.details,
            control: 'coords'
          });
        throw cause;
      }
      const geographic = scale
        ? await this.#runtime.transforms.prepare({
            source: definition.code,
            target: 'EPSG:4326'
          })
        : undefined;
      const readoutKey = JSON.stringify({
        display: definition.code,
        controls:
          config.controls?.filter((control) =>
            ['scale', 'coords'].includes(control.id)
          ) ?? []
      });
      if (!current()) return;
      let applied = false;
      const commit = this.#tail.then(async () => {
        if (!current() || request !== this.#request) return;
        if (!this.#engine) {
          this.#mounting = candidate;
          candidateHost = createEngineHost(this.#node);
          this.#mountingHost = candidateHost;
          await candidate!.mount(candidateHost.node, {
            displayCrs: definition,
            view,
            signal: this.#lifetime.signal,
            allowExperimental: config.display.allowExperimental
          });
          if (!current()) return;
          this.#engine = candidate;
          this.#host = candidateHost;
          candidateHost = undefined;
          this.#mountingHost = undefined;
          candidate = undefined;
          this.#mounting = undefined;
          this.#bindEngine(this.#engine!);
        }
        // Drop removed/replaced sources before starting independent layer loads.
        for (const [id, entry] of this.#records) {
          if (this.#declarative.has(id)) continue;
          const item = config.layers.find((layer) => layer.id === id);
          if (!item || entry.key !== JSON.stringify(item.source)) {
            this.#removeLayer(id);
          }
        }
        for (const id of this.#layerErrors.keys())
          if (!this.#declarative.has(id)) this.#layerErrors.delete(id);
        this.#config = config;
        applied = true;
        if (!this.layers.attached)
          await this.layers.attach(this.#engine!, definition, {
            allowExperimental: config.display.allowExperimental
          });
        if (!current()) return;
        if (move) this.#engine!.setView(view);
        this.#ready = true;
        if (readoutKey !== this.#readoutKey) {
          this.#readouts?.destroy();
          this.#readouts = undefined;
          this.#readoutState = null;
          this.#readoutKey = readoutKey;
          if (scale || coords)
            this.#readouts = new ReadoutObserver(
              this.#engine!,
              {
                display: definition,
                target,
                geographic,
                transform,
                scale,
                coordinates: !!coords,
                width: () => this.#node.clientWidth,
                onerror: (error) => this.#callbacks.oncontrolerror?.(error)
              },
              (state) => {
                this.#readoutState = state;
                this.#emit();
              }
            );
        }
        this.#emit();
        if (!this.#notified) {
          this.#notified = true;
          this.#callbacks.onready?.(this.#engine!);
        }
      });
      this.#tail = commit.catch(() => {});
      await commit;
      if (!current() || !applied) return;
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
      candidateHost?.dispose();
      if (this.#mounting === candidate) this.#mounting = undefined;
    }
  }
  async #switchDisplayCrs(
    config: ResolvedMapConfig,
    request: number
  ): Promise<void> {
    const previousConfig = this.#config!;
    // Apply unrelated layer/control edits first so preflight cannot silently drop a blocker.
    if (
      JSON.stringify(config.layers) !== JSON.stringify(previousConfig.layers) ||
      JSON.stringify(config.controls) !==
        JSON.stringify(previousConfig.controls)
    )
      throw new MapError('DISPLAY_CRS_SWITCH_BLOCKED', {
        reason:
          'Apply layer and control configuration changes before switching the display CRS.'
      });
    const missing = [
      ...previousConfig.layers,
      ...[...this.#declarative.keys()].map((id) => ({ id }))
    ].filter(
      (layer) =>
        !this.#records.has(layer.id) ||
        this.#records.get(layer.id)!.managed.status !== 'ready'
    );
    if (missing.length)
      throw new MapError('DISPLAY_CRS_SWITCH_BLOCKED', {
        layers: missing.map((layer) => ({
          id: layer.id,
          reason:
            'Layer is still loading or failed; finish or remove it before switching.'
        }))
      });
    const definition = await this.#runtime.crs.resolve(config.display.crs);
    if (this.#lifetime.signal.aborted || request !== this.#request) return;
    this.layers.assertCanSwitchDisplayCrs(definition, {
      allowExperimental: config.display.allowExperimental
    });
    this.#switchAbort?.abort();
    const abort = new AbortController();
    this.#switchAbort = abort;
    const stop = () => abort.abort();
    this.#lifetime.signal.addEventListener('abort', stop, { once: true });
    const run = this.#tail.then(async () => {
      let candidate: IMapEngine | undefined;
      let host: EngineHost | undefined;
      let transaction:
        | Awaited<ReturnType<LayerManager['prepareDisplayCrsSwitch']>>
        | undefined;
      let offErrors: (() => void) | undefined;
      let committed = false;
      let retire: (() => void) | undefined;
      try {
        abort.signal.throwIfAborted();
        this.#switching = true;
        this.#emit();
        const old = this.#engine!;
        const oldHost = this.#host!;
        const oldDefinition = await this.#runtime.crs.resolve(
          previousConfig.display.crs
        );
        const explicitView =
          JSON.stringify(config.view) !== JSON.stringify(previousConfig.view);
        const targetView = async () => {
          if (!explicitView)
            return transformedDisplayView(
              old,
              oldDefinition,
              definition,
              this.#runtime
            );
          const transform = await this.#runtime.transforms.prepare({
            source: config.view.center.crs,
            target: definition.code
          });
          if (definition.code === 'EPSG:3857') {
            const geographic = await this.#runtime.transforms.prepare({
              source: config.view.center.crs,
              target: 'EPSG:4326'
            });
            if (
              Math.abs(
                geographic.coordinate(config.view.center.coordinates)[1]
              ) > 85.0511287798066
            )
              throw new MapError('DISPLAY_CRS_SWITCH_BLOCKED', {
                reason:
                  'Requested centre is outside the native Web Mercator latitude range.'
              });
          }
          return {
            center: transform.coordinate(config.view.center.coordinates),
            resolution: resolveViewResolution(
              config.view,
              definition.tileMatrix
            ),
            rotation: config.view.rotation ?? 0
          };
        };
        const initialView = await targetView();
        const loadingEngine = this.#runtime.engines.create(config.engine);
        void loadingEngine
          .then(
            (engine) => {
              if (abort.signal.aborted && !committed) engine.destroy();
            },
            () => {}
          )
          .catch(() => {});
        candidate = await waitForSwitch(loadingEngine, abort.signal);
        assertDisplayCrs(
          candidate.capabilities,
          definition.code,
          config.display.allowExperimental
        );
        const scale =
          config.controls?.some((control) => control.id === 'scale') ?? false;
        const coords = config.controls?.find(
          (control) => control.id === 'coords'
        );
        const target = coords
          ? await this.#runtime.crs.resolve(
              coords.readoutCrs ?? definition.code
            )
          : definition;
        const geographic = scale
          ? await this.#runtime.transforms.prepare({
              source: definition.code,
              target: 'EPSG:4326'
            })
          : undefined;
        const transform = coords
          ? await this.#runtime.transforms.prepare({
              source: definition.code,
              target: target.code
            })
          : undefined;
        const accuracy = new Map<string, TransformAccuracy>();
        for (const [id, entry] of this.#records)
          accuracy.set(
            id,
            (
              await this.#runtime.transforms.forDisplay(
                entry.spec.source.crs,
                definition.code
              )
            ).accuracy
          );
        abort.signal.throwIfAborted();
        this.#switching = true;
        this.#emit();
        host = createEngineHost(this.#node, true);
        this.#mounting = candidate;
        this.#mountingHost = host;
        const mounted = candidate;
        const pending = candidate.mount(host.node, {
          displayCrs: definition,
          view: initialView,
          signal: abort.signal,
          allowExperimental: config.display.allowExperimental
        });
        void pending
          .finally(() => {
            if (abort.signal.aborted && !committed) mounted.destroy();
          })
          .catch(() => {});
        await waitForSwitch(pending, abort.signal);
        const tileErrors = new Map<string, MapError>();
        offErrors = candidate.on('error', (error) => {
          if (typeof error.details.id === 'string')
            tileErrors.set(error.details.id, error);
        });
        transaction = await this.layers.prepareDisplayCrsSwitch(
          candidate,
          definition,
          {
            signal: abort.signal,
            allowExperimental: config.display.allowExperimental
          }
        );
        // Navigation can continue on the old map during preparation. Preserve its latest view.
        const finalView = await targetView();
        candidate.resize();
        candidate.setView(finalView);
        abort.signal.throwIfAborted();
        const focus =
          !!oldHost.node.ownerDocument &&
          oldHost.node.contains(oldHost.node.ownerDocument.activeElement);
        const cleanup = transaction.commit();
        committed = true;
        let retired = false;
        retire = () => {
          if (retired) return;
          retired = true;
          try {
            try {
              cleanup();
            } catch {
              this.#callbacks.oncontrolerror?.(
                new MapError('LAYER_LOAD_FAILED', {
                  reason:
                    'Old display resource cleanup failed after a successful switch.'
                })
              );
            }
          } finally {
            try {
              old.destroy();
            } finally {
              oldHost.dispose();
            }
          }
        };
        this.#generation++;
        this.#preparing?.abort();
        this.#offView?.();
        this.#offError?.();
        this.#readouts?.destroy();
        this.#readouts = undefined;
        this.#readoutState = null;
        this.#readoutKey = '';
        this.#engine = candidate;
        this.#host = host;
        candidate = undefined;
        host = undefined;
        this.#mounting = undefined;
        this.#mountingHost = undefined;
        this.#host.activate();
        this.#config = config;
        for (const [id, entry] of this.#records) {
          entry.spec = entry.managed.spec;
          entry.accuracy = accuracy.get(id)!;
        }
        this.#layerErrors.clear();
        for (const [id, error] of tileErrors)
          if (this.#records.has(id)) this.#layerErrors.set(id, error);
        offErrors();
        offErrors = undefined;
        this.#bindEngine(this.#engine);
        if (scale || coords)
          this.#readouts = new ReadoutObserver(
            this.#engine,
            {
              display: definition,
              target,
              geographic,
              transform,
              scale,
              coordinates: !!coords,
              width: () => this.#node.clientWidth,
              onerror: (error) => this.#callbacks.oncontrolerror?.(error)
            },
            (state) => {
              this.#readoutState = state;
              this.#emit();
            }
          );
        this.#readoutKey = JSON.stringify({
          display: definition.code,
          controls:
            config.controls?.filter((control) =>
              ['scale', 'coords'].includes(control.id)
            ) ?? []
        });
        const view = this.#engine.getView();
        this.#lastSwitchView = view;
        this.#switching = false;
        this.#callbacks.ondisplaycrschange?.({
          previous: previousConfig.display.crs,
          current: definition.code,
          view
        });
        this.#callbacks.onviewchange?.(view, 'api');
        this.#emit();
        if (focus) this.#host.node.focus({ preventScroll: true });
        retire();
        if (!this.#lifetime.signal.aborted)
          this.#callbacks.onready?.(this.#engine);
        for (const [id, error] of tileErrors) {
          this.#callbacks.onlayererror?.(error);
          this.#declarative.get(id)?.onerror?.(error);
        }
      } catch (cause) {
        if (abort.signal.aborted || this.#lifetime.signal.aborted) return;
        if (committed) throw cause;
        const error =
          cause instanceof MapError ? cause : new MapError('ENGINE_STATE');
        throw new MapError('DISPLAY_CRS_SWITCH_BLOCKED', {
          reason:
            typeof error.details.reason === 'string'
              ? error.details.reason
              : 'Replacement map could not be prepared; the previous map remains active.',
          cause: error.code,
          ...(typeof error.details.id === 'string'
            ? {
                layers: [
                  {
                    id: error.details.id,
                    reason:
                      typeof error.details.reason === 'string'
                        ? error.details.reason
                        : error.code
                  }
                ]
              }
            : {})
        });
      } finally {
        retire?.();
        offErrors?.();
        if (this.#mounting === candidate) this.#mounting = undefined;
        if (this.#mountingHost === host) this.#mountingHost = undefined;
        try {
          transaction?.dispose();
        } finally {
          try {
            candidate?.destroy();
          } finally {
            host?.dispose();
          }
        }
        if (this.#switchAbort === abort) {
          this.#switchAbort = undefined;
          this.#switching = false;
          this.#mounting = undefined;
          this.#mountingHost = undefined;
          this.#emit();
        }
        this.#lifetime.signal.removeEventListener('abort', stop);
      }
    });
    this.#tail = run.catch(() => {});
    await run;
  }

  #bindEngine(engine: IMapEngine): void {
    this.#offError = engine.on('error', (error) => {
      const id = error.details.id;
      if (
        typeof id === 'string' &&
        (this.#records.has(id) || this.#declarative.has(id)) &&
        !this.#layerErrors.has(id)
      ) {
        this.#layerErrors.set(id, error);
        this.#emit();
        this.#callbacks.onlayererror?.(error);
        this.#declarative.get(id)?.onerror?.(error);
      }
    });
    this.#offView = engine.on('viewchange', (event) => {
      if (this.#engine !== engine) return;
      const echo = this.#lastSwitchView;
      this.#lastSwitchView = undefined;
      if (
        echo &&
        event.source === 'api' &&
        echo.center.every(
          (coordinate, index) =>
            Math.abs(coordinate - event.view.center[index]) < 1e-7
        ) &&
        Math.abs(echo.resolution - event.view.resolution) < 1e-9 &&
        echo.rotation === event.view.rotation
      )
        return;
      this.#emit();
      this.#callbacks.onviewchange?.(event.view, event.source);
    });
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
  /** Child components own these handles; config reconciliation never removes them. */
  registerLayer(
    spec: LayerSpec,
    options: { onerror?: (error: MapError) => void } = {}
  ): ManagedLayer {
    if (!this.#ready || !this.#config || this.#lifetime.signal.aborted)
      throw new MapError('ENGINE_STATE');
    if (
      this.#config.layers.some((layer) => layer.id === spec.id) ||
      this.#declarative.has(spec.id)
    )
      throw new MapError('LAYER_DUPLICATE', { id: spec.id });
    let generation = 0;
    const active = () =>
      this.#declarative.get(spec.id)?.managed === owned &&
      !this.#lifetime.signal.aborted;
    const report = (cause: unknown) => {
      if (!active() || this.#layerErrors.has(spec.id)) return;
      const error =
        cause instanceof MapError
          ? new MapError(cause.code, { ...cause.details, id: spec.id })
          : new MapError('LAYER_LOAD_FAILED', { id: spec.id });
      this.#layerErrors.set(spec.id, error);
      this.#emit();
      this.#callbacks.onlayererror?.(error);
      options.onerror?.(error);
    };
    const managed = this.layers.add(spec, { onerror: report });
    const refresh = () => {
      const request = ++generation;
      const display = this.#config!.display.crs;
      const currentSpec = managed.spec;
      this.#layerErrors.delete(spec.id);
      const existing = this.#records.get(spec.id);
      if (existing) existing.spec = currentSpec;
      this.#emit();
      void (async () => {
        try {
          const { accuracy } = await this.#runtime.transforms.forDisplay(
            currentSpec.source.crs,
            display
          );
          if (!active() || request !== generation) return;
          // A concurrent switch has its own accuracy transaction. Retry against its committed CRS.
          if (display !== this.#config!.display.crs) {
            refresh();
            return;
          }
          this.#records.set(spec.id, {
            key: 'declarative',
            spec: managed.spec,
            accuracy,
            managed: owned
          });
          this.#emit();
          await managed.ready;
          if (active() && request === generation) this.#emit();
        } catch (cause) {
          if (active() && request === generation) report(cause);
        }
      })();
    };
    const update = (next: LayerSpec) => {
      if (!active()) throw new MapError('LAYER_REMOVED', { id: spec.id });
      managed.update(next);
      if (managed.status === 'error') managed.reload();
      refresh();
    };
    const owned: ManagedLayer = {
      id: managed.id,
      get status() {
        return managed.status;
      },
      get ready() {
        return managed.ready;
      },
      get spec() {
        return managed.spec;
      },
      update,
      setVisible: (visible) => update({ ...managed.spec, visible }),
      setOpacity: (opacity) => update({ ...managed.spec, opacity }),
      setOrder: (order) => update({ ...managed.spec, order }),
      setStyle: (style) => update({ ...managed.spec, style }),
      reload: () => {
        if (!active()) throw new MapError('LAYER_REMOVED', { id: spec.id });
        managed.reload();
        refresh();
      },
      remove: () => {
        if (this.#declarative.get(spec.id)?.managed !== owned) return;
        generation++;
        this.#declarative.delete(spec.id);
        try {
          managed.remove();
        } finally {
          this.#records.delete(spec.id);
          this.#layerErrors.delete(spec.id);
          this.#emit();
        }
      }
    };
    this.#declarative.set(spec.id, {
      managed: owned,
      onerror: options.onerror
    });
    refresh();
    return owned;
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
  useCentreCoordinates(): void {
    this.#readouts?.useCentre();
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
    this.#switchAbort?.abort();
    this.#lifetime.abort();
    this.#readouts?.destroy();
    this.#readouts = undefined;
    this.#readoutState = null;
    this.#offView?.();
    this.#offError?.();
    try {
      this.layers.destroy();
    } finally {
      this.#engine?.destroy();
      this.#mounting?.destroy();
      this.#engine = undefined;
      this.#host?.dispose();
      this.#mountingHost?.dispose();
      this.#records.clear();
      this.#declarative.clear();
    }
  }
}
