<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import MapScale from './MapScale.svelte';
  import CoordinateReadout from './CoordinateReadout.svelte';
  import LayerList from './LayerList.svelte';
  import MapErrorNotice from './MapErrorNotice.svelte';
  import { Alert, Button } from '@cii/svelte';
  import { MapController, createMapRuntime } from '../map-controller.js';
  import type {
    MapRuntime,
    MapSnapshot,
    DisplayCrsChange
  } from '../map-controller.js';
  import { MapError } from '../errors.js';
  import type { MapConfig } from '../config/types.js';
  import type { MapConfigSnapshot } from '../config/snapshot.js';
  import type { IMapEngine } from '../engine/types.js';
  import type { ViewState } from '../view.js';
  import { setMapContext } from './context.js';

  interface Props extends Omit<
    HTMLAttributes<HTMLElement>,
    'children' | 'onerror'
  > {
    config: MapConfig;
    label: string;
    description?: string;
    height?: string;
    view?: ViewState;
    runtime?: MapRuntime;
    children?: Snippet;
    onready?: (engine: IMapEngine) => void;
    ondisplaycrschange?: (change: DisplayCrsChange) => void;
    onerror?: (error: MapError) => void;
    onviewchange?: (view: ViewState, source: 'api' | 'user') => void;
  }
  let {
    config,
    label,
    description,
    height = '24rem',
    view = $bindable(),
    runtime,
    children,
    onready,
    ondisplaycrschange,
    onerror,
    onviewchange,
    class: className = '',
    'aria-describedby': describedBy,
    ...rest
  }: Props = $props();
  const id = $props.id();
  const descriptionIds = $derived(
    [describedBy, description ? `${id}-description` : undefined]
      .filter(Boolean)
      .join(' ') || undefined
  );
  const selectedRuntime = untrack(() => runtime) ?? createMapRuntime();
  let controller = $state.raw<MapController | null>(null);
  let snapshot = $state.raw<MapSnapshot | null>(null);
  let error = $state.raw<MapError | null>(null);
  export function exportSnapshot(): MapConfigSnapshot {
    if (!controller) throw new MapError('ENGINE_STATE');
    return controller.exportSnapshot();
  }
  const engineCredits: Record<string, { name: string; url: string }> = {
    leaflet: { name: 'Leaflet', url: 'https://leafletjs.com/' },
    openlayers: { name: 'OpenLayers', url: 'https://openlayers.org/' },
    maplibre: { name: 'MapLibre', url: 'https://maplibre.org/' }
  };
  const engineCredit = $derived(
    engineCredits[snapshot?.engine?.id ?? config.engine]
  );
  const ready = $derived(snapshot?.ready ?? false);
  const datumDiffers = $derived(
    snapshot?.layers.some(
      (layer) =>
        layer.count !== null && layer.accuracy.datumRelationship !== 'same'
    ) ?? false
  );
  setMapContext({
    get engine() {
      return snapshot?.engine ?? null;
    },
    get layers() {
      return controller?.layers ?? null;
    },
    get ready() {
      return ready;
    },
    get displayCrs() {
      return snapshot?.displayCrs ?? null;
    },
    get switching() {
      return snapshot?.switching ?? false;
    },
    registerLayer: (spec, options) => {
      if (!controller) throw new MapError('ENGINE_STATE');
      return controller.registerLayer(spec, options);
    },
    setDisplayCrs: (code: string) =>
      controller
        ? controller.setDisplayCrs(code)
        : Promise.reject(new MapError('ENGINE_STATE'))
  });

  function report(cause: unknown) {
    const next =
      cause instanceof MapError ? cause : new MapError('SOURCE_LOAD_FAILED');
    error = next;
    untrack(() => onerror?.(next));
  }
  function navigate(action: () => void) {
    try {
      action();
    } catch (cause) {
      report(cause);
    }
  }

  function attach(node: HTMLElement) {
    const instance = new MapController(node, selectedRuntime, {
      onstate: (next) => {
        instance.host.tabIndex = next.ready ? 0 : -1;
        instance.host.setAttribute(
          'aria-busy',
          String(!next.ready || next.switching)
        );
        snapshot = next;
      },
      onready: (engine) => onready?.(engine),
      ondisplaycrschange: (change) => {
        view = change.view;
        ondisplaycrschange?.(change);
      },
      onlayererror: (error) => onerror?.(error),
      oncontrolerror: (error) => onerror?.(error),
      onviewchange: (next, source) => {
        if (source === 'user') view = next;
        onviewchange?.(next, source);
      }
    });
    controller = instance;
    const resize = new ResizeObserver(() => instance.resize());
    resize.observe(node);
    return () => {
      resize.disconnect();
      instance.destroy();
      if (controller === instance) controller = null;
    };
  }
  $effect(() => {
    const instance = controller;
    const next = $state.snapshot(config);
    if (!instance) return;
    let obsolete = false;
    void instance
      .applyConfig(next)
      .then(() => {
        if (!obsolete) error = null;
      })
      .catch((cause: unknown) => {
        if (obsolete) return;
        report(cause);
      });
    return () => {
      obsolete = true;
    };
  });
  $effect(() => {
    if (ready && view) navigate(() => controller?.setView(view!));
  });
</script>

<section
  {...rest}
  class={['cii-map', className]}
  aria-label={rest['aria-label'] ?? label}
  aria-describedby={descriptionIds}
  data-map-ready={ready}
  data-map-switching={snapshot?.switching ?? false}
  data-display-crs={snapshot?.displayCrs ?? undefined}
>
  {#if description}<p id={`${id}-description`} class="description">
      {description}
    </p>{/if}
  <div
    class="viewport"
    role="group"
    aria-label={`${label} map viewport and controls`}
    class:has-readouts={snapshot?.readouts?.scaleEnabled ||
      snapshot?.readouts?.coordinatesEnabled}
    style:--cii-map-height={height}
    onpointerleave={(event) => {
      if (event.pointerType !== 'touch') controller?.useCentreCoordinates();
    }}
    onpointercancel={() => controller?.useCentreCoordinates()}
  >
    <div
      class="canvas"
      role="group"
      aria-label={`${label} map surface`}
      data-canvas-label={`${label} map canvas`}
      data-canvas-description={`${id}-shortcuts`}
      onfocusin={(event) => {
        if (
          event.target instanceof HTMLElement &&
          event.target.matches(':focus-visible')
        )
          controller?.useCentreCoordinates();
      }}
      {@attach attach}
    ></div>
    {#if snapshot?.showZoom ?? true}
      <div class="zoom" role="group" aria-label="Map zoom">
        <Button
          variant="secondary"
          disabled={!ready || snapshot?.switching}
          aria-label="Zoom in"
          onclick={() => navigate(() => controller?.zoom(1))}>+</Button
        >
        <Button
          variant="secondary"
          disabled={!ready || snapshot?.switching}
          aria-label="Zoom out"
          onclick={() => navigate(() => controller?.zoom(-1))}>−</Button
        >
      </div>
    {/if}
    {#if snapshot?.showLayerList}
      <div class="layer-list">
        <LayerList
          layers={snapshot.layers}
          disabled={snapshot.switching}
          onchange={(id, patch) =>
            navigate(() => controller?.updateLayer(id, patch))}
        />
      </div>
    {/if}
    {#if snapshot?.readouts}
      <div class="readouts">
        {#if snapshot.readouts.scaleEnabled}<MapScale
            value={snapshot.readouts.scale}
          />{/if}
        {#if snapshot.readouts.coordinatesEnabled}<CoordinateReadout
            value={snapshot.readouts.coordinates}
            oncentre={() => controller?.useCentreCoordinates()}
          />{/if}
      </div>
    {/if}
    {#if !ready && !error}<p class="loading" role="status">Loading map…</p>{/if}
  </div>
  <div class="attribution" aria-label="Map attribution">
    {#if engineCredit}<a href={engineCredit.url}>{engineCredit.name}</a
      >{/if}{#each snapshot?.attributions ?? [] as attribution (attribution)}<span
      >
        · {attribution}</span
      >{/each}
  </div>
  {#if snapshot?.switching}<p role="status">
      Switching display coordinate system…
    </p>{/if}
  {#if error}<MapErrorNotice {error} title="Map could not be updated" />{/if}
  {#each snapshot?.layerErrors ?? [] as failure (failure.id)}
    <MapErrorNotice
      error={failure.error}
      title={`Layer ${failure.id} could not be loaded`}
    />
  {/each}
  {#if datumDiffers}<Alert tone="warning" title="Display accuracy"
      >Some layers use a different or unknown datum. Display positions do not
      establish precise alignment; original source coordinates are retained.</Alert
    >{/if}
  <details>
    <summary>Keyboard shortcuts</summary>
    <p id={`${id}-shortcuts`}>
      Focus the map. Arrow keys pan; + and − zoom. Tab moves to the controls and
      out of the map.
      {#if snapshot?.engine?.capabilities.rotation}
        Shift + Right or Up rotates clockwise by 15°; Shift + Left or Down
        rotates anticlockwise by 15°.
      {/if}
    </p>
  </details>
  {#if snapshot?.layers.length}<details>
      <summary>Layer information</summary>
      <ul>
        {#each snapshot.layers as layer (layer.id)}<li>
            {layer.id}: {layer.count === null
              ? 'raster tiles'
              : `${layer.count} features`} · {layer.crs.crs.code}{layer.accuracy
              .datumRelationship !== 'same' && layer.count !== null
              ? ' · datum differs from display'
              : ''}
          </li>{/each}
      </ul>
    </details>{/if}
  {@render children?.()}
</section>

<style>
  .cii-map {
    display: grid;
    container-type: inline-size;
    gap: var(--cii-space-3);
    color: var(--cii-text-primary);
    font: var(--cii-font-body)/var(--cii-line-body) var(--cii-font-family);
  }
  .description {
    margin: 0;
    color: var(--cii-text-secondary);
  }
  .viewport {
    position: relative;
    height: var(--cii-map-height);
    min-height: 12rem;
    border: 1px solid var(--cii-border-default);
    border-radius: var(--cii-radius-card);
    overflow: hidden;
    isolation: isolate;
  }
  .canvas {
    position: relative;
    width: 100%;
    height: 100%;
    background: var(--cii-map-surface);
  }
  .canvas :global([data-map-host]) {
    background: var(--cii-map-surface);
  }
  .canvas :global([data-map-host]:focus-visible) {
    outline: 3px solid var(--cii-focus-ring);
    outline-offset: -4px;
  }
  .zoom {
    position: absolute;
    top: var(--cii-space-3);
    left: var(--cii-space-3);
    z-index: 1000;
    display: grid;
    gap: var(--cii-space-1);
  }
  .layer-list {
    position: absolute;
    top: var(--cii-space-3);
    right: var(--cii-space-3);
    z-index: 1000;
    width: min(17rem, calc(100% - 6rem));
    max-height: calc(100% - 2 * var(--cii-space-3));
    overflow: auto;
    background: var(--cii-bg-card);
    border-radius: var(--cii-radius-input);
    font-size: var(--cii-font-caption);
  }
  .readouts {
    position: absolute;
    bottom: var(--cii-space-3);
    left: var(--cii-space-3);
    right: var(--cii-space-3);
    z-index: 1000;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: var(--cii-space-2);
    max-height: 70%;
    overflow: auto;
    pointer-events: none;
    font-size: var(--cii-font-caption);
  }
  .readouts :global(> *) {
    pointer-events: auto;
  }
  .readouts :global(.coordinates) {
    margin-left: auto;
  }
  .has-readouts .layer-list {
    max-height: calc(30% - 2 * var(--cii-space-3));
  }
  @container (max-width: 36rem) {
    .viewport.has-readouts {
      height: auto;
    }
    .has-readouts .canvas {
      height: var(--cii-map-height);
      min-height: 12rem;
    }
    .has-readouts .readouts {
      position: static;
      max-height: none;
      overflow: visible;
      margin: var(--cii-space-3);
    }
    .has-readouts .layer-list {
      max-height: min(16rem, calc(var(--cii-map-height) * 0.5));
    }
  }
  .loading {
    position: absolute;
    right: var(--cii-space-3);
    bottom: var(--cii-space-3);
    margin: 0;
    padding: var(--cii-space-2) var(--cii-space-3);
    background: var(--cii-bg-card);
    border: 1px solid var(--cii-border-default);
    border-radius: var(--cii-radius-input);
  }
  .attribution {
    font-size: var(--cii-font-caption);
    line-height: var(--cii-line-caption);
    text-align: right;
    overflow-wrap: anywhere;
  }
  .attribution a {
    color: inherit;
    text-decoration: underline;
  }
  details {
    font-size: var(--cii-font-caption);
    line-height: var(--cii-line-caption);
  }
  summary {
    min-height: 24px;
    cursor: pointer;
  }
  summary:focus-visible,
  a:focus-visible {
    outline: 3px solid var(--cii-focus-ring);
    outline-offset: 3px;
  }
</style>
