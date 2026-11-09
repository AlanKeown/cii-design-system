<script lang="ts">
  import { untrack } from 'svelte';
  import { getMapContext } from './context.js';
  import { layerIdentityKey, isConfirmedCrs } from '../layers/compatibility.js';
  import { MapError } from '../errors.js';
  import type { LayerSpec, ManagedLayer } from '../layers/types.js';
  import type { PortableStyle } from '../engine/types.js';
  import MapErrorNotice from './MapErrorNotice.svelte';

  interface Props {
    spec: LayerSpec;
    visible?: boolean;
    opacity?: number;
    order?: number;
    style?: PortableStyle;
    onerror?: (error: MapError) => void;
  }
  let { spec, visible, opacity, order, style, onerror }: Props = $props();
  const map = getMapContext();
  const identity = $derived(
    isConfirmedCrs(spec.source?.crs) ? layerIdentityKey(spec) : 'unconfirmed'
  );
  const effective = $derived<LayerSpec>({
    ...spec,
    ...(visible === undefined ? {} : { visible }),
    ...(opacity === undefined ? {} : { opacity }),
    ...(order === undefined ? {} : { order }),
    ...(style === undefined ? {} : { style })
  });
  let registration:
    | { manager: typeof map.layers; key: string; handle: ManagedLayer }
    | undefined;
  let error = $state.raw<MapError | null>(null);
  function report(cause: unknown) {
    const next =
      cause instanceof MapError ? cause : new MapError('LAYER_LOAD_FAILED');
    error = next;
    untrack(() => onerror?.(next));
  }
  $effect(() => {
    const key = identity;
    const next = effective;
    const manager = map.layers;
    const ready = map.ready;
    untrack(() => {
      if (
        registration &&
        (!ready || registration.manager !== manager || registration.key !== key)
      ) {
        registration.handle.remove();
        registration = undefined;
      }
      if (!ready) return;
      try {
        if (registration) registration.handle.update(next);
        else
          registration = {
            manager,
            key,
            handle: map.registerLayer(next, {
              onerror: (error) => untrack(() => onerror?.(error))
            })
          };
        error = null;
      } catch (cause) {
        report(cause);
      }
    });
  });
  $effect(() => () => {
    registration?.handle.remove();
    registration = undefined;
  });

  /** Retry the current renderer without changing registration identity. */
  export function reload(): void {
    registration?.handle.reload();
  }
</script>

{#if error}<MapErrorNotice
    {error}
    title={`Layer ${spec.id} could not be updated`}
  />{/if}
