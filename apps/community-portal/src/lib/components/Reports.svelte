<script lang="ts">
  import { Button, StatusChip } from '@cii/svelte';
  import {
    recordModules,
    type PortalRecords,
    type PortalRecord,
    type Module,
    type RecordModule,
    type Role
  } from '../model.ts';
  import { date, money, today } from '../format.ts';
  import { selectReportRows } from '../reporting.ts';
  let {
    records,
    allowed,
    role,
    onDownload
  }: {
    records: PortalRecords;
    allowed: Module[];
    role: Role;
    onDownload: (records: PortalRecord[], name: string) => void;
  } = $props();
  let reportModule = $state<RecordModule>('Members');
  let reportFrom = $state(today().slice(0, 7) + '-01');
  let reportTo = $state(today());
  const invalidRange = $derived(
    !!reportFrom && !!reportTo && reportFrom > reportTo
  );
  const reportRows = $derived(
    selectReportRows(records[reportModule], reportFrom, reportTo)
  );
</script>

<div class="page-heading">
  <div>
    <p class="eyebrow">MEASURE WHAT MATTERS</p>
    <h1>Reports</h1>
    <p>Turn everyday activity into a clearer picture.</p>
  </div>
  <Button
    class="primary"
    disabled={invalidRange}
    onclick={() =>
      onDownload(reportRows, reportModule.toLowerCase() + '-report')}
    >↓ Export CSV</Button
  >
</div>
<section class="panel">
  <div class="report-controls">
    <label
      >Report<select bind:value={reportModule}
        >{#each recordModules.filter((m) => m !== 'Administration' && (role === 'Board Member' || allowed.includes(m))) as m (m)}<option
            >{m}</option
          >{/each}</select
      ></label
    ><label
      >From<input
        type="date"
        aria-invalid={invalidRange}
        aria-describedby={invalidRange ? 'report-range-error' : undefined}
        bind:value={reportFrom}
      /></label
    ><label
      >To<input
        type="date"
        aria-invalid={invalidRange}
        aria-describedby={invalidRange ? 'report-range-error' : undefined}
        bind:value={reportTo}
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
      : reportRows.length +
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
