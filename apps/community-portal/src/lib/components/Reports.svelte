<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Button, StatusChip, Alert } from '@cii/svelte';
  import {
    recordModules,
    type PortalRecord,
    type Module,
    type RecordModule,
    type Role
  } from '../model.ts';
  import { date, money, today } from '../format.ts';
  import { backendError } from '../backend/types.ts';
  let {
    allowed,
    role,
    loadRows,
    onDownload
  }: {
    allowed: Module[];
    role: Role;
    loadRows: (
      module: RecordModule,
      from: string,
      to: string
    ) => Promise<PortalRecord[]>;
    onDownload: (records: PortalRecord[], name: string) => void;
  } = $props();
  let reportModule = $state<RecordModule>('Members');
  let reportFrom = $state(today().slice(0, 7) + '-01');
  let reportTo = $state(today());
  const invalidRange = $derived(
    !!reportFrom && !!reportTo && reportFrom > reportTo
  );
  let reportRows = $state<PortalRecord[]>([]);
  let loading = $state(true);
  let reportError = $state('');
  let requestVersion = 0;
  onMount(() => {
    void loadReport();
  });
  onDestroy(() => {
    requestVersion++;
  });
  async function loadReport() {
    const version = ++requestVersion;
    reportRows = [];
    reportError = '';
    loading = !invalidRange;
    if (invalidRange) return;
    try {
      const rows = await loadRows(reportModule, reportFrom, reportTo);
      if (version === requestVersion) reportRows = rows;
    } catch (error) {
      if (version === requestVersion) reportError = backendError(error).message;
    } finally {
      if (version === requestVersion) loading = false;
    }
  }
</script>

<div class="page-heading">
  <div>
    <p class="eyebrow">MEASURE WHAT MATTERS</p>
    <h1>Reports</h1>
    <p>Turn everyday activity into a clearer picture.</p>
  </div>
  <Button
    class="primary"
    disabled={invalidRange || loading || !!reportError}
    onclick={() =>
      onDownload(reportRows, reportModule.toLowerCase() + '-report')}
    >↓ Export CSV</Button
  >
</div>
<section class="panel" aria-busy={loading}>
  {#if reportError}<Alert tone="danger" role="alert">{reportError}</Alert>{/if}
  <div class="report-controls">
    <label
      >Report<select
        bind:value={
          () => reportModule,
          (value) => {
            reportModule = value as RecordModule;
            void loadReport();
          }
        }
        >{#each recordModules.filter((m) => m !== 'Administration' && (role === 'Board Member' || allowed.includes(m))) as m (m)}<option
            >{m}</option
          >{/each}</select
      ></label
    ><label
      >From<input
        type="date"
        aria-invalid={invalidRange}
        aria-describedby={invalidRange ? 'report-range-error' : undefined}
        bind:value={
          () => reportFrom,
          (value) => {
            reportFrom = value;
            void loadReport();
          }
        }
      /></label
    ><label
      >To<input
        type="date"
        aria-invalid={invalidRange}
        aria-describedby={invalidRange ? 'report-range-error' : undefined}
        bind:value={
          () => reportTo,
          (value) => {
            reportTo = value;
            void loadReport();
          }
        }
      /></label
    >
  </div>
  {#if invalidRange}<p id="report-range-error" class="error" role="alert">
      Choose an end date after the start date.
    </p>{/if}
  <p
    class="sr-only"
    aria-live="polite"
    aria-atomic="true"
    data-testid="report-results"
  >
    {invalidRange
      ? 'Choose an end date after the start date.'
      : loading
        ? 'Loading report…'
        : reportError ||
          reportRows.length +
            ' ' +
            reportModule.toLowerCase() +
            ' records in this period.'}
  </p>
  <div class="report-summary">
    <span>{reportRows.length}<small>records in this period</small></span><span
      >{new Set(reportRows.map((r) => r.status)).size}<small
        >status groups</small
      ></span
    >{#if reportModule === 'Donations'}<span
        >{money(
          reportRows.reduce(
            (s, r) => s + (r.kind === 'Donations' ? r.amount : 0),
            0
          )
        )}<small>total contributions</small></span
      >{/if}
  </div>
  <div class="table-scroll">
    <table>
      <caption class="sr-only">{reportModule} report</caption>
      <thead
        ><tr
          ><th scope="col">Record</th><th scope="col">Status</th><th scope="col"
            >Date</th
          ></tr
        ></thead
      ><tbody
        >{#each reportRows as r (r.id)}<tr
            ><td>{r.name}</td><td><StatusChip>{r.status}</StatusChip></td><td
              >{date(r.date)}</td
            ></tr
          >{:else}<tr
            ><td colspan="3" class="empty">No records match this date range.</td
            ></tr
          >{/each}</tbody
      >
    </table>
  </div>
</section>
