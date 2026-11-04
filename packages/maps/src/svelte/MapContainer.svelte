<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import { Alert, Button } from '@cii/svelte';
  import 'leaflet/dist/leaflet.css';
  import { MapController, createLeafletRuntime } from '../map-controller.js';
  import type { MapRuntime, MapSnapshot } from '../map-controller.js';
  import { MapError } from '../errors.js';
  import type { MapConfig } from '../config/types.js';
  import type { IMapEngine } from '../engine/types.js';
  import type { ViewState } from '../view.js';
  import { setMapContext } from './context.js';

  interface Props {
    config: MapConfig;
    label: string;
    description?: string;
    height?: string;
    view?: ViewState;
    runtime?: MapRuntime;
    children?: Snippet;
    onready?: (engine: IMapEngine) => void;
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
    onerror,
    onviewchange
  }: Props = $props();
  const id = $props.id();
  const selectedRuntime = untrack(() => runtime) ?? createLeafletRuntime();
  let controller = $state.raw<MapController | null>(null);
  let snapshot = $state.raw<MapSnapshot | null>(null);
  let error = $state.raw<MapError | null>(null);
  const ready = $derived(snapshot?.ready ?? false);
  const datumDiffers = $derived(
    snapshot?.layers.some(
      (layer) => layer.accuracy.datumRelationship !== 'same'
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
    }
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
        node.tabIndex = next.ready ? 0 : -1;
        snapshot = next;
      },
      onready: (engine) => onready?.(engine),
      onlayererror: (error) => onerror?.(error),
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
  class="cii-map"
  aria-label={label}
  aria-describedby={description ? `${id}-description` : undefined}
  data-map-ready={ready}
>
  {#if description}<p id={`${id}-description`} class="description">
      {description}
    </p>{/if}
  <div class="viewport" style:height>
    <div
      class="canvas"
      role="application"
      aria-label={`${label} map canvas`}
      aria-describedby={`${id}-shortcuts`}
      aria-busy={!ready}
      tabindex="-1"
      {@attach attach}
    ></div>
    {#if snapshot?.showZoom ?? true}
      <div class="zoom" role="group" aria-label="Map zoom">
        <Button
          variant="secondary"
          disabled={!ready}
          aria-label="Zoom in"
          onclick={() => navigate(() => controller?.zoom(1))}>+</Button
        >
        <Button
          variant="secondary"
          disabled={!ready}
          aria-label="Zoom out"
          onclick={() => navigate(() => controller?.zoom(-1))}>−</Button
        >
      </div>
    {/if}
    {#if !ready && !error}<p class="loading" role="status">Loading map…</p>{/if}
  </div>
  <div class="attribution" aria-label="Map attribution">
    <a href="https://leafletjs.com/">Leaflet</a
    >{#each snapshot?.attributions ?? [] as attribution (attribution)}<span>
        · {attribution}</span
      >{/each}
  </div>
  {#if error}<Alert tone="danger" role="alert" title="Map could not be updated"
      >{error.code}{typeof error.details.reason === 'string'
        ? `: ${error.details.reason}`
        : ''}</Alert
    >{/if}
  {#each snapshot?.layerErrors ?? [] as failure (failure.id)}
    <Alert
      tone="danger"
      role="alert"
      title={`Layer ${failure.id} could not be loaded`}
    >
      {failure.error.code}{typeof failure.error.details.reason === 'string'
        ? `: ${failure.error.details.reason}`
        : ''}
    </Alert>
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
    </p>
  </details>
  {#if snapshot?.layers.length}<details>
      <summary>Layer information</summary>
      <ul>
        {#each snapshot.layers as layer (layer.id)}<li>
            {layer.id}: {layer.count} features · {layer.crs.crs.code}{layer
              .accuracy.datumRelationship !== 'same'
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
    gap: var(--cii-space-3, 12px);
    color: var(--cii-text-primary, #172c43);
    font-family: var(--cii-font-family, sans-serif);
  }
  .description {
    margin: 0;
    color: var(--cii-text-secondary, #526077);
  }
  .viewport {
    position: relative;
    min-height: 12rem;
    border: 1px solid var(--cii-border-default, #ccd3df);
    border-radius: var(--cii-radius-card, 12px);
    overflow: hidden;
    isolation: isolate;
  }
  .canvas {
    width: 100%;
    height: 100%;
    background: var(--cii-bg-subtle, #eef1f7);
  }
  .canvas:focus-visible {
    outline: 3px solid var(--cii-focus-ring, #7955bd);
    outline-offset: -4px;
  }
  .zoom {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 1000;
    display: grid;
    gap: 4px;
  }
  .loading {
    position: absolute;
    right: 12px;
    bottom: 12px;
    margin: 0;
    padding: 8px 12px;
    background: var(--cii-bg-card, white);
  }
  .attribution {
    font-size: 0.75rem;
    text-align: right;
    overflow-wrap: anywhere;
  }
  .attribution a {
    color: inherit;
    text-decoration: underline;
  }
  details {
    font-size: 0.875rem;
  }
  summary {
    cursor: pointer;
  }
  summary:focus-visible,
  a:focus-visible {
    outline: 3px solid var(--cii-focus-ring, #7955bd);
    outline-offset: 3px;
  }
</style>
