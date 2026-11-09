<script lang="ts" generics="T extends SourceInput">
  import { untrack } from 'svelte';
  import { Alert, Button, TextField } from '@cii/svelte';
  import { MapError } from '../errors.js';
  import {
    confirmProbedSourceCrs,
    requiresCrsDeclaration
  } from '../crs/resolve.js';
  import type { ProbeResult, SourceInput } from '../crs/resolve.js';
  import type {
    CrsDeclaration,
    CrsHint,
    CrsSelectionPolicy,
    ConfirmedCrs
  } from '../crs/types.js';
  import { createInterpretationPreview } from '../crs/interpretation-preview.js';
  import { createLeafletRuntime } from '../map-controller.js';
  import type { MapRuntime } from '../map-controller.js';
  import type { CrsConfirmation } from './crs-confirm-types.js';
  import MapContainer from './MapContainer.svelte';
  import MapErrorNotice from './MapErrorNotice.svelte';

  let {
    source,
    runtime,
    displayCrs = 'EPSG:3857',
    requireDeclaration = false,
    declarer = '',
    label = 'Confirm source coordinate system',
    onconfirm,
    onerror
  }: {
    source: T;
    runtime?: MapRuntime;
    displayCrs?: string;
    requireDeclaration?: boolean;
    declarer?: string;
    label?: string;
    onconfirm?: (result: CrsConfirmation<T>) => void;
    onerror?: (error: MapError) => void;
  } = $props();
  const ownRuntime = createLeafletRuntime();
  const selectedRuntime = $derived(runtime ?? ownRuntime);
  const id = $props.id();
  let code = $state('');
  let by = $state('');
  let axisOrder = $state<'xy' | 'yx'>('xy');
  let policy = $state<CrsSelectionPolicy>('prefer-native');
  let acknowledged = $state(false);
  let retry = $state(0);
  let inspection = $state.raw<{
    input: T;
    probe: ProbeResult;
    needsDeclaration: boolean;
    runtime: MapRuntime;
    displayCrs: string;
    requireDeclaration: boolean;
  } | null>(null);
  let loading = $state(true);
  let probeError = $state.raw<MapError | null>(null);
  let evaluation = $state.raw<{
    declaration: CrsDeclaration;
    confirmed?: ConfirmedCrs;
    mismatch: boolean;
    error?: MapError;
    preview?: Awaited<ReturnType<typeof createInterpretationPreview>>;
    previewError?: MapError;
  } | null>(null);
  let evaluating = $state(false);
  let accepted = $state(false);
  let evaluatingCode = $state('');
  let confirmationError = $state.raw<MapError | null>(null);
  const hint = $derived<CrsHint | undefined>(
    inspection?.probe.kind === 'hint'
      ? inspection.probe.hint
      : inspection?.needsDeclaration && inspection.probe.kind === 'metadata'
        ? {
            code:
              inspection.probe.nativeCode ??
              inspection.probe.candidates[0]?.crs.code,
            from: 'none'
          }
        : undefined
  );
  const current = $derived(
    inspection?.runtime === selectedRuntime &&
      inspection.displayCrs === displayCrs &&
      inspection.requireDeclaration === requireDeclaration
  );
  const canConfirm = $derived(
    current &&
      !loading &&
      !evaluating &&
      !!evaluation?.confirmed &&
      !evaluation.previewError &&
      (!inspection?.needsDeclaration || (!!code.trim() && !!by.trim()))
  );

  function changed() {
    acknowledged = false;
    accepted = false;
    confirmationError = null;
  }
  function normalise(cause: unknown): MapError {
    return cause instanceof MapError
      ? cause
      : new MapError('SOURCE_LOAD_FAILED');
  }

  $effect(() => {
    const input = $state.snapshot(source) as T;
    const selected = selectedRuntime;
    const display = displayCrs;
    const forceDeclaration = requireDeclaration;
    const initialDeclarer = declarer;
    void retry;
    const abort = new AbortController();
    inspection = null;
    evaluation = null;
    loading = true;
    probeError = null;
    acknowledged = false;
    accepted = false;
    confirmationError = null;
    code = '';
    by = '';
    axisOrder = 'xy';
    policy = 'prefer-native';
    void (async () => {
      try {
        const provider = selected.sources.require(input.provider);
        const probe = await provider.probe(input, {
          sources: selected.sources,
          crsRegistry: selected.crs,
          displayCrs: display,
          signal: abort.signal,
          requireDeclaration: forceDeclaration
        });
        if (abort.signal.aborted) return;
        const needsDeclaration = requiresCrsDeclaration(
          provider,
          probe,
          forceDeclaration
        );
        if (!needsDeclaration && input.crs && 'code' in input.crs)
          throw new MapError('CRS_DECLARATION_NOT_ALLOWED');
        code =
          input.crs && 'code' in input.crs
            ? input.crs.code
            : probe.kind === 'hint'
              ? (probe.hint?.code ?? '')
              : (probe.nativeCode ?? probe.candidates[0]?.crs.code ?? '');
        by =
          input.crs && 'code' in input.crs
            ? input.crs.provenance.by
            : initialDeclarer;
        axisOrder =
          input.crs && 'code' in input.crs
            ? (input.crs.axisOrder ?? 'xy')
            : 'xy';
        policy =
          input.crs && 'fromMetadata' in input.crs
            ? (input.crs.policy ?? 'prefer-native')
            : 'prefer-native';
        inspection = {
          input,
          probe,
          needsDeclaration,
          runtime: selected,
          displayCrs: display,
          requireDeclaration: forceDeclaration
        };
      } catch (cause) {
        if (abort.signal.aborted) return;
        probeError = normalise(cause);
        untrack(() => onerror?.(probeError!));
      } finally {
        if (!abort.signal.aborted) loading = false;
      }
    })();
    return () => abort.abort();
  });

  $effect(() => {
    const item = inspection;
    const selectedCode = code.trim();
    const name = by.trim();
    const axes = axisOrder;
    const selection = policy;
    const allowMismatch = acknowledged;
    const abort = new AbortController();
    accepted = false;
    confirmationError = null;
    evaluatingCode = selectedCode;
    if (!item) {
      evaluation = null;
      evaluating = false;
      return;
    }
    evaluating = true;
    void (async () => {
      const declaration: CrsDeclaration = item.needsDeclaration
        ? {
            code: selectedCode,
            axisOrder: axes,
            provenance: { kind: 'declared', by: name }
          }
        : { fromMetadata: true, policy: selection };
      const context = {
        sources: item.runtime.sources,
        crsRegistry: item.runtime.crs,
        displayCrs: item.displayCrs,
        requireDeclaration: item.requireDeclaration,
        signal: abort.signal
      };
      try {
        const result = await confirmProbedSourceCrs(
          { ...item.input, crs: declaration },
          item.probe,
          context
        );
        const mismatch =
          !result.ok && result.error.code === 'CRS_HINT_MISMATCH';
        const final =
          mismatch && allowMismatch
            ? await confirmProbedSourceCrs(
                { ...item.input, crs: declaration },
                item.probe,
                { ...context, acknowledgeHintMismatch: true }
              )
            : result;
        if (abort.signal.aborted) return;
        let preview:
          Awaited<ReturnType<typeof createInterpretationPreview>> | undefined;
        let previewError: MapError | undefined;
        if (item.needsDeclaration && selectedCode && item.probe.preview) {
          try {
            preview = await createInterpretationPreview(
              item.probe.preview,
              { code: selectedCode, axisOrder: axes },
              item.runtime
            );
          } catch (cause) {
            previewError = normalise(cause);
          }
        }
        if (abort.signal.aborted) return;
        evaluation = {
          declaration,
          mismatch,
          ...(final.ok ? { confirmed: final.value } : { error: final.error }),
          preview,
          previewError
        };
      } catch (cause) {
        if (!abort.signal.aborted)
          evaluation = {
            declaration,
            mismatch: false,
            error: normalise(cause)
          };
      } finally {
        if (!abort.signal.aborted) evaluating = false;
      }
    })();
    return () => abort.abort();
  });

  function confirm(event: SubmitEvent) {
    event.preventDefault();
    if (accepted || !canConfirm || !inspection || !evaluation?.confirmed)
      return;
    if (
      JSON.stringify($state.snapshot(source)) !==
      JSON.stringify(inspection.input)
    )
      return;
    if (
      'code' in evaluation.declaration &&
      (evaluation.declaration.code !== code.trim() ||
        evaluation.declaration.axisOrder !== axisOrder ||
        evaluation.declaration.provenance.by !== by.trim())
    )
      return;
    if (
      'fromMetadata' in evaluation.declaration &&
      evaluation.declaration.policy !== policy
    )
      return;
    const confirmed = structuredClone(evaluation.confirmed);
    const input = {
      ...inspection.input,
      crs: structuredClone(evaluation.declaration)
    } as T & { crs: CrsDeclaration };
    try {
      if (confirmed.provenance.kind === 'declared')
        inspection.runtime.rememberConfirmation(input, confirmed);
      onconfirm?.({ source: input, confirmed });
      accepted = true;
    } catch (cause) {
      confirmationError = normalise(cause);
      onerror?.(confirmationError);
    }
  }
</script>

<section
  class="crs-confirm"
  aria-label={label}
  aria-busy={loading || evaluating}
>
  <h3>{label}</h3>
  {#if loading}<p role="status">Reading source coordinate metadata…</p>{/if}
  {#if probeError}
    <MapErrorNotice
      error={probeError}
      title="Source metadata could not be read"
    />
    <Button variant="secondary" onclick={() => retry++}>Retry metadata</Button>
  {:else if inspection && current}
    <form onsubmit={confirm}>
      {#if inspection.needsDeclaration}
        <p>
          A detected hint is a suggestion. Declare the CRS and axis order before
          using this source.
        </p>
        {#if hint}
          <div class="hint" aria-label="Detected CRS hint">
            <p>
              Detected hint: <code>{hint.code ?? 'WKT only'}</code> · hint
              source: <code>{hint.from}</code>
            </p>
            {#if hint.wkt}<pre>{hint.wkt}</pre>{/if}
          </div>
        {:else}<p>
            No embedded CRS hint is available. No CRS has been assumed.
          </p>{/if}
        <TextField
          id={`${id}-code`}
          label="Source CRS code"
          bind:value={code}
          required
          hint="Enter a registered CRS code, such as EPSG:7856 or OGC:CRS84."
          error={evaluation?.error?.code === 'CRS_NOT_FOUND' && evaluatingCode
            ? 'This CRS code is not registered.'
            : undefined}
          oninput={changed}
        />
        <label for={`${id}-axes`}>Source axis order</label>
        <select id={`${id}-axes`} bind:value={axisOrder} onchange={changed}>
          <option value="xy"
            >x/y (easting/northing or longitude/latitude)</option
          >
          <option value="yx"
            >y/x (northing/easting or latitude/longitude)</option
          >
        </select>
        <TextField
          id={`${id}-by`}
          label="Declared by"
          bind:value={by}
          required
          hint="Name the person or organisation making this declaration."
          oninput={changed}
        />
        {#if evaluation?.mismatch}
          <Alert
            tone="warning"
            role="alert"
            title="CRS declaration differs from the hint"
          >
            <p id={`${id}-mismatch`}>
              The detected hint and your declaration disagree, or WKT
              equivalence is unverified. Check the coordinates and extent before
              acknowledging.
            </p>
          </Alert>
          <label class="acknowledgement">
            <input
              type="checkbox"
              bind:checked={acknowledged}
              aria-describedby={`${id}-mismatch`}
            />
            I checked the source and acknowledge this CRS hint mismatch.
          </label>
        {/if}
        {#if evaluation?.preview}
          <p>
            Sample interpreted as longitude {evaluation.preview.sample[0].toFixed(
              7
            )}, latitude {evaluation.preview.sample[1].toFixed(7)}.
          </p>
          <p>
            Envelope in raw source coordinates: {inspection.probe.preview?.extent.join(
              ', '
            )}.
          </p>
          <p>
            This is an unconfirmed interpretation, not a survey accuracy check.
            The outline is the source envelope, not its features.
          </p>
          {#key evaluation.preview.config}<MapContainer
              config={evaluation.preview.config}
              label="Unconfirmed source extent"
              description="Synthetic envelope using the selected CRS and axis order. Compare it with the expected location."
              height="18rem"
            />{/key}
        {:else if evaluation?.previewError}
          <MapErrorNotice
            error={evaluation.previewError}
            title="Coordinate preview could not be interpreted"
          />
        {:else}<p>
            No sample coordinate or extent preview is available from this
            provider.
          </p>{/if}
      {:else}
        <p>
          The CRS is resolved from metadata. A manual declaration is not
          allowed.
        </p>
        <label for={`${id}-policy`}>CRS selection policy</label>
        <select id={`${id}-policy`} bind:value={policy} onchange={changed}>
          <option value="prefer-native"
            >Prefer native CRS, otherwise first advertised</option
          >
          <option value="prefer-display"
            >Prefer display CRS, otherwise first advertised</option
          >
        </select>
        <p>Display CRS: <code>{displayCrs}</code></p>
        {#if inspection.probe.kind === 'metadata'}
          <p>
            Advertised CRSs: {inspection.probe.candidates
              .map((candidate) => candidate.crs.code)
              .join(', ')}
          </p>
        {/if}
      {/if}
      {#if evaluation?.confirmed && (!inspection.needsDeclaration || accepted)}
        <div aria-label="Resolved source CRS">
          <p>
            Selected CRS: <code>{evaluation.confirmed.crs.code}</code> · axis
            order: {evaluation.confirmed.crs.axisOrder}
          </p>
          {#if evaluation.confirmed.provenance.kind === 'service-metadata'}
            <p>
              Metadata document: <code
                >{evaluation.confirmed.provenance.url}</code
              >
            </p>
            <p>
              Metadata element: <code
                >{evaluation.confirmed.provenance.element}</code
              >
            </p>
          {:else if evaluation.confirmed.provenance.kind === 'database-metadata'}
            <p>
              Database source: {evaluation.confirmed.provenance
                .table}.{evaluation.confirmed.provenance.column} · SRID {evaluation
                .confirmed.provenance.srid}
            </p>
          {:else}<p>Declared by: {evaluation.confirmed.provenance.by}</p>{/if}
        </div>
      {/if}
      {#if evaluation?.error && (!inspection.needsDeclaration || !['CRS_HINT_MISMATCH', 'CRS_NOT_CONFIRMED', 'CRS_NOT_FOUND'].includes(evaluation.error.code))}
        <MapErrorNotice
          error={evaluation.error}
          title="Source CRS could not be confirmed"
        />
      {/if}
      {#if confirmationError}<MapErrorNotice
          error={confirmationError}
          title="Confirmation could not be applied"
        />{/if}
      <Button type="submit" disabled={!canConfirm || accepted}
        >{inspection.needsDeclaration
          ? 'Confirm source CRS'
          : 'Use metadata CRS'}</Button
      >
      <p role="status">
        {accepted
          ? 'Source CRS confirmed.'
          : evaluating
            ? 'Checking coordinate interpretation…'
            : evaluation?.mismatch && !acknowledged
              ? 'Confirmation is blocked until the mismatch is acknowledged.'
              : 'Source CRS has not been accepted.'}
      </p>
    </form>
  {/if}
</section>

<style>
  .crs-confirm,
  form {
    display: grid;
    gap: var(--cii-space-3);
    min-width: 0;
  }
  .crs-confirm {
    color: var(--cii-text-primary);
    font: var(--cii-font-body)/var(--cii-line-body) var(--cii-font-family);
  }
  h3,
  p {
    margin: 0;
  }
  code,
  pre {
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
  select {
    width: 100%;
    min-width: 0;
    min-height: 42px;
    padding: var(--cii-space-2);
    font: inherit;
    color: var(--cii-text-primary);
    background: var(--cii-bg-card);
    border: 1px solid var(--cii-border-default);
    border-radius: var(--cii-radius-input);
  }
  .acknowledgement {
    display: flex;
    align-items: flex-start;
    gap: var(--cii-space-2);
  }
  input {
    min-width: 24px;
    min-height: 24px;
    accent-color: var(--cii-map-feature);
  }
  select:focus-visible,
  input:focus-visible {
    outline: 3px solid var(--cii-focus-ring);
    outline-offset: 3px;
  }
</style>
