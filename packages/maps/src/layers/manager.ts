import { MapError } from '../errors.ts';
import { Registry } from '../registry.ts';
import { assertDisplayCrs } from '../engine/registry.ts';
import type { CrsDef } from '../crs/types.ts';
import type {
  FeatureBatch,
  IMapEngine,
  LayerHandle,
  PortableStyle,
  ResolvedLayer
} from '../engine/types.ts';
import {
  assertStyle,
  isConfirmedCrs,
  isSourceSpatialSupport,
  layerIdentityKey,
  spatialIncompatibility
} from './compatibility.ts';
import type {
  LayerRenderer,
  LayerSpec,
  LayerStatus,
  ManagedLayer,
  PreparedLayer,
  RendererContext
} from './types.ts';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: MapError) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  // Components may use onerror instead of awaiting ready. Keep the original promise rejectable.
  void promise.catch(() => {});
  return { promise, resolve, reject };
}

interface Entry {
  spec: LayerSpec;
  status: LayerStatus;
  ready: ReturnType<typeof deferred>;
  controller?: AbortController;
  handle?: LayerHandle;
  prepared?: PreparedLayer;
  onerror?: (error: MapError) => void;
  generation: number;
  managed?: ManagedLayer;
}

interface Attachment {
  engine: IMapEngine;
  displayCrs: CrsDef;
  allowExperimental: boolean;
}

function snapshot(spec: LayerSpec): LayerSpec {
  return {
    ...spec,
    source: {
      ...spec.source,
      crs: structuredClone(spec.source.crs),
      spatial: structuredClone(spec.source.spatial)
    },
    style: spec.style ? structuredClone(spec.style) : undefined
  };
}

function validateSpec(spec: LayerSpec): void {
  if (!isConfirmedCrs(spec?.source?.crs))
    throw new MapError('CRS_NOT_CONFIRMED', { id: spec?.id });
  const nonblank = (value: unknown) =>
    typeof value === 'string' && !!value.trim();
  if (
    !nonblank(spec.id) ||
    !nonblank(spec.source.provider) ||
    !nonblank(spec.source.identity) ||
    !nonblank(spec.source.renderKind) ||
    !isSourceSpatialSupport(spec.source.spatial) ||
    typeof spec.source.remote !== 'boolean'
  )
    throw new MapError('LAYER_INVALID', { id: spec.id });
  if (
    spec.opacity !== undefined &&
    (!Number.isFinite(spec.opacity) || spec.opacity < 0 || spec.opacity > 1)
  )
    throw new MapError('LAYER_INVALID', { id: spec.id, field: 'opacity' });
  if (spec.order !== undefined && !Number.isInteger(spec.order))
    throw new MapError('LAYER_INVALID', { id: spec.id, field: 'order' });
  if (spec.visible !== undefined && typeof spec.visible !== 'boolean')
    throw new MapError('LAYER_INVALID', { id: spec.id, field: 'visible' });
  if (spec.source.remote && !nonblank(spec.attribution))
    throw new MapError('ATTRIBUTION_REQUIRED', { id: spec.id });
}

function oncePrepared(prepared: PreparedLayer): PreparedLayer {
  let removed = false;
  return {
    data: prepared.data,
    dispose: () => {
      if (removed) return;
      removed = true;
      prepared.dispose?.();
    }
  };
}

/** Instance-scoped layer ownership. The caller owns engine mount/destroy. */
export class LayerManager {
  readonly renderers: Registry<LayerRenderer>;
  readonly queueUntilAttached: boolean;
  #entries = new Map<string, Entry>();
  #attachment?: Attachment;
  #tail: Promise<void> = Promise.resolve();
  #destroyed = false;

  constructor(
    options: {
      renderers?: Registry<LayerRenderer>;
      queueUntilAttached?: boolean;
    } = {}
  ) {
    this.renderers = options.renderers ?? new Registry<LayerRenderer>();
    this.queueUntilAttached = options.queueUntilAttached ?? true;
  }

  get size(): number {
    return this.#entries.size;
  }
  get attached(): boolean {
    return !!this.#attachment;
  }

  #assertActive(): void {
    if (this.#destroyed)
      throw new MapError('ENGINE_STATE', {
        reason: 'Layer manager is destroyed.'
      });
  }

  #compatible(spec: LayerSpec, attachment: Attachment): LayerRenderer {
    assertDisplayCrs(
      attachment.engine.capabilities,
      attachment.displayCrs.code,
      attachment.allowExperimental
    );
    const reason = spatialIncompatibility(
      spec,
      attachment.displayCrs,
      attachment.engine.capabilities
    );
    if (reason)
      throw new MapError('LAYER_INCOMPATIBLE', { id: spec.id, reason });
    assertStyle(spec.style, attachment.engine.capabilities);
    const renderer = this.renderers.get(
      `${attachment.engine.id}:${spec.source.renderKind}`
    );
    if (!renderer)
      throw new MapError('LAYER_INCOMPATIBLE', {
        id: spec.id,
        reason: 'No renderer is registered for this engine and render kind.'
      });
    const rendererReason = renderer.compatibility(spec.source, {
      engineId: attachment.engine.id,
      capabilities: attachment.engine.capabilities,
      displayCrs: attachment.displayCrs
    });
    if (rendererReason)
      throw new MapError('LAYER_INCOMPATIBLE', {
        id: spec.id,
        reason: rendererReason
      });
    return renderer;
  }

  add(
    spec: LayerSpec,
    options: { onerror?: (error: MapError) => void } = {}
  ): ManagedLayer {
    this.#assertActive();
    validateSpec(spec);
    if (this.#entries.has(spec.id))
      throw new MapError('LAYER_DUPLICATE', { id: spec.id });
    if (!this.#attachment && !this.queueUntilAttached)
      throw new MapError('ENGINE_STATE', {
        reason: 'Attach an engine before adding layers.'
      });
    if (this.#attachment) this.#compatible(spec, this.#attachment);
    const entry: Entry = {
      spec: snapshot(spec),
      status: 'queued',
      ready: deferred(),
      onerror: options.onerror,
      generation: 0
    };
    this.#entries.set(spec.id, entry);
    if (this.#attachment) void this.#schedule(entry, this.#attachment);
    const manager = this;
    const managed: ManagedLayer = {
      id: spec.id,
      get status() {
        return entry.status;
      },
      get ready() {
        return entry.ready.promise;
      },
      get spec() {
        return snapshot(entry.spec);
      },
      update(next) {
        manager.#update(entry, next);
      },
      reload() {
        manager.#reload(entry);
      },
      setVisible(visible) {
        manager.#update(entry, { ...entry.spec, visible });
      },
      setOpacity(opacity) {
        manager.#update(entry, { ...entry.spec, opacity });
      },
      setOrder(order) {
        manager.#update(entry, { ...entry.spec, order });
      },
      setStyle(style) {
        manager.#update(entry, { ...entry.spec, style });
      },
      remove() {
        manager.#remove(entry);
      }
    };
    entry.managed = managed;
    return managed;
  }

  get(id: string): ManagedLayer | undefined {
    return this.#entries.get(id)?.managed;
  }
  list(): readonly ManagedLayer[] {
    return [...this.#entries.values()].flatMap((entry) =>
      entry.managed ? [entry.managed] : []
    );
  }

  /** Call only after engine.mount(), using the same display CRS definition. */
  async attach(
    engine: IMapEngine,
    displayCrs: CrsDef,
    options: { allowExperimental?: boolean } = {}
  ): Promise<void> {
    this.#assertActive();
    if (this.#attachment)
      throw new MapError('ENGINE_STATE', {
        reason: 'Detach before attaching another engine.'
      });
    assertDisplayCrs(
      engine.capabilities,
      displayCrs.code,
      options.allowExperimental
    );
    engine.getView(); // Fail before changing ownership if the engine is not mounted.
    const attachment: Attachment = {
      engine,
      displayCrs: structuredClone(displayCrs),
      allowExperimental: options.allowExperimental ?? false
    };
    this.#attachment = attachment;
    for (const entry of this.#entries.values())
      void this.#schedule(entry, attachment);
    // Updates/additions during attachment extend the queue. Wait for the current queue,
    // rather than an obsolete snapshot, before a container may announce readiness.
    while (this.#attachment === attachment) {
      const tail = this.#tail;
      await tail;
      if (tail === this.#tail) break;
    }
  }

  #schedule(entry: Entry, attachment: Attachment): Promise<void> {
    const generation = ++entry.generation;
    const task = this.#tail.then(() =>
      this.#load(entry, attachment, generation)
    );
    // A failed layer never prevents later queued layers from being prepared.
    this.#tail = task.catch(() => {});
    return this.#tail;
  }

  async #load(
    entry: Entry,
    attachment: Attachment,
    generation: number
  ): Promise<void> {
    if (
      entry.status === 'removed' ||
      this.#attachment !== attachment ||
      entry.generation !== generation
    )
      return;
    const controller = new AbortController();
    entry.controller?.abort();
    entry.controller = controller;
    const current = () =>
      !controller.signal.aborted &&
      this.#attachment === attachment &&
      entry.status !== 'removed' &&
      entry.generation === generation;
    let prepared: PreparedLayer | undefined;
    let stopWaiting: (() => void) | undefined;
    try {
      const renderer = this.#compatible(entry.spec, attachment);
      entry.status = 'loading';
      const context: RendererContext = {
        engineId: attachment.engine.id,
        capabilities: attachment.engine.capabilities,
        displayCrs: attachment.displayCrs,
        signal: controller.signal
      };
      const source = entry.spec.source;
      const pending = Promise.resolve()
        .then(() => {
          if (!current())
            throw new MapError('LAYER_REMOVED', { id: entry.spec.id });
          return renderer.prepare(source, context);
        })
        .then(oncePrepared);
      const aborted = new Promise<undefined>((resolve) => {
        stopWaiting = () => resolve(undefined);
        controller.signal.addEventListener('abort', stopWaiting, {
          once: true
        });
      });
      prepared = await Promise.race([pending, aborted]);
      if (!prepared) {
        // Providers should honour AbortSignal, but an uncooperative late result is still owned.
        void pending
          .then(
            (late) => late.dispose?.(),
            () => {}
          )
          .catch(() => {});
        return;
      }
      if (!current()) return;
      const resolved: ResolvedLayer = {
        id: entry.spec.id,
        renderKind: entry.spec.source.renderKind,
        data: prepared.data,
        displayCrs: attachment.displayCrs.code,
        sourceCrs: entry.spec.source.crs,
        visible: entry.spec.visible ?? true,
        opacity: entry.spec.opacity ?? 1,
        order: entry.spec.order ?? 0,
        style: entry.spec.style,
        attribution: entry.spec.attribution
      };
      if (resolved.renderKind === 'features') {
        const data = prepared.data;
        if (
          !data ||
          typeof data !== 'object' ||
          !('type' in data) ||
          data.type !== 'FeatureCollection' ||
          !('features' in data) ||
          !Array.isArray(data.features)
        )
          throw new MapError('LAYER_LOAD_FAILED', {
            id: entry.spec.id,
            reason: 'Feature renderer did not return a FeatureBatch.'
          });
      }
      if (entry.handle?.setData && resolved.renderKind === 'features') {
        // Feature renderers promise engine-ready FeatureBatch; reject an invalid renderer result.
        entry.handle.setData(prepared.data as FeatureBatch);
        if (!current()) return;
        const previous = entry.prepared;
        entry.prepared = prepared;
        prepared = undefined;
        previous?.dispose?.();
      } else {
        this.#release(entry);
        if (!current()) return;
        const handle = attachment.engine.addLayer(resolved);
        if (!current()) {
          handle.remove();
          return;
        }
        entry.handle = handle;
        entry.prepared = prepared;
        prepared = undefined;
      }
      if (!current()) return;
      entry.status = 'ready';
      entry.ready.resolve();
    } catch (cause) {
      if (!current()) return;
      const error =
        cause instanceof MapError
          ? cause
          : new MapError('LAYER_LOAD_FAILED', { id: entry.spec.id });
      entry.status = 'error';
      entry.ready.reject(error);
      entry.onerror?.(error);
    } finally {
      if (stopWaiting)
        controller.signal.removeEventListener('abort', stopWaiting);
      try {
        prepared?.dispose?.();
      } finally {
        if (entry.controller === controller) entry.controller = undefined;
      }
    }
  }

  #update(entry: Entry, next: LayerSpec): void {
    this.#assertActive();
    if (entry.status === 'removed')
      throw new MapError('LAYER_REMOVED', { id: entry.spec.id });
    validateSpec(next);
    if (layerIdentityKey(entry.spec) !== layerIdentityKey(next))
      throw new MapError('LAYER_IDENTITY_CHANGED', { id: entry.spec.id });
    if (this.#attachment) this.#compatible(next, this.#attachment);
    const previous = entry.spec;
    const reload =
      previous.source.data !== next.source.data ||
      JSON.stringify(previous.source.spatial) !==
        JSON.stringify(next.source.spatial);
    if (entry.handle) {
      if (previous.visible !== next.visible)
        entry.handle.setVisible(next.visible ?? true);
      if (previous.opacity !== next.opacity)
        entry.handle.setOpacity(next.opacity ?? 1);
      if (previous.order !== next.order) entry.handle.setOrder(next.order ?? 0);
      if (JSON.stringify(previous.style) !== JSON.stringify(next.style))
        entry.handle.setStyle(next.style ?? {});
    }
    entry.spec = snapshot(next);
    if (reload && this.#attachment) this.#reload(entry);
  }

  #reload(entry: Entry): void {
    this.#assertActive();
    if (entry.status === 'removed')
      throw new MapError('LAYER_REMOVED', { id: entry.spec.id });
    if (this.#attachment) {
      entry.controller?.abort();
      entry.ready.reject(
        new MapError('LAYER_LOAD_FAILED', {
          id: entry.spec.id,
          reason: 'Layer load superseded.'
        })
      );
      entry.ready = deferred();
      entry.status = 'queued';
      void this.#schedule(entry, this.#attachment);
    }
  }

  #release(entry: Entry): void {
    const handle = entry.handle;
    const prepared = entry.prepared;
    entry.handle = undefined;
    entry.prepared = undefined;
    try {
      handle?.remove();
    } finally {
      prepared?.dispose?.();
    }
  }

  #remove(entry: Entry): void {
    if (entry.status === 'removed') return;
    entry.status = 'removed';
    entry.controller?.abort();
    entry.ready.reject(new MapError('LAYER_REMOVED', { id: entry.spec.id }));
    this.#entries.delete(entry.spec.id);
    this.#release(entry);
  }

  /** Read-only preflight; includes detached target specs retained by staged edits (R2.4). */
  assertCanSwitchDisplayCrs(
    displayCrs: CrsDef,
    options: {
      stagedTargets?: readonly LayerSpec[];
      allowExperimental?: boolean;
    } = {}
  ): void {
    this.#assertActive();
    if (!this.#attachment)
      throw new MapError('ENGINE_STATE', { reason: 'No engine is attached.' });
    const attachment: Attachment = {
      ...this.#attachment,
      displayCrs,
      allowExperimental:
        options.allowExperimental ?? this.#attachment.allowExperimental
    };
    assertDisplayCrs(
      attachment.engine.capabilities,
      displayCrs.code,
      attachment.allowExperimental
    );
    const blocked: { id: string; reason: string }[] = [];
    for (const spec of [...this.#entries.values()]
      .map((entry) => entry.spec)
      .concat(options.stagedTargets ?? [])) {
      try {
        validateSpec(spec);
        this.#compatible(spec, attachment);
      } catch (error) {
        blocked.push({
          id: spec.id,
          reason: error instanceof Error ? error.message : 'Incompatible layer.'
        });
      }
    }
    if (blocked.length)
      throw new MapError('DISPLAY_CRS_SWITCH_BLOCKED', { layers: blocked });
  }

  /** Preserve registrations/settings for a new engine; cancel all outstanding preparation. */
  detach(): void {
    if (!this.#attachment) return;
    this.#attachment = undefined;
    this.#tail = Promise.resolve();
    const errors: unknown[] = [];
    for (const entry of this.#entries.values()) {
      entry.controller?.abort();
      entry.ready.reject(
        new MapError('LAYER_LOAD_FAILED', {
          id: entry.spec.id,
          reason: 'Engine detached.'
        })
      );
      entry.ready = deferred();
      entry.status = 'queued';
      try {
        this.#release(entry);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length)
      throw new AggregateError(errors, 'Layer detach cleanup failed.');
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#attachment = undefined;
    const errors: unknown[] = [];
    for (const entry of [...this.#entries.values()]) {
      try {
        this.#remove(entry);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length)
      throw new AggregateError(errors, 'Layer manager cleanup failed.');
  }
}

export function createLayerManager(
  options?: ConstructorParameters<typeof LayerManager>[0]
): LayerManager {
  return new LayerManager(options);
}
