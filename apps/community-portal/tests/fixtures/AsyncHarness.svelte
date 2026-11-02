<script lang="ts">
  import { initialRecords, modules } from '../../src/lib/data.ts';
  import { PortalBackendError } from '../../src/lib/backend/types.ts';
  import type {
    PortalRecord,
    RecordForm,
    RecordModule
  } from '../../src/lib/model.ts';
  import { changeRecord, type RecordChanges } from '../../src/lib/records.ts';
  import RecordFormDialog from '../../src/lib/components/RecordFormDialog.svelte';
  import RecordDrawer from '../../src/lib/components/RecordDrawer.svelte';
  import Reports from '../../src/lib/components/Reports.svelte';

  const view = new URLSearchParams(location.search).get('view');
  let open = $state(true);
  let record = $state<PortalRecord>({ ...initialRecords.Members[0]! });
  async function save(form: RecordForm) {
    const response = await fetch('/operation/save', {
      method: 'POST',
      body: JSON.stringify(form)
    });
    if (!response.ok)
      throw new PortalBackendError('invalid', 'Please correct the email.', {
        email: 'Use a different email address.'
      });
    open = false;
  }
  async function update(changes: RecordChanges) {
    const response = await fetch('/operation/update', {
      method: 'POST',
      body: JSON.stringify(changes)
    });
    if (!response.ok)
      throw new PortalBackendError(
        'offline',
        'Please try saving the note again.'
      );
    record = changeRecord(
      record,
      changes,
      new Date().toISOString(),
      'Test actor'
    );
  }
  async function loadRows(
    module: RecordModule,
    from: string,
    to: string
  ): Promise<PortalRecord[]> {
    const response = await fetch(
      '/operation/report?' + new URLSearchParams({ module, from, to })
    );
    if (!response.ok)
      throw new PortalBackendError(
        'offline',
        'Report unavailable. Please try again.'
      );
    return response.json();
  }
</script>

{#if view === 'reports'}
  <Reports
    allowed={[...modules]}
    role="Admin"
    {loadRows}
    onDownload={() => {}}
  />
{:else if open}
  {#if view === 'drawer'}
    <RecordDrawer
      {record}
      records={initialRecords}
      audit={[]}
      canWrite={true}
      returnFocus={null}
      onClose={() => (open = false)}
      onEdit={() => {}}
      onUpdate={update}
    />
  {:else}
    <RecordFormDialog
      module="Members"
      editing={null}
      members={initialRecords.Members}
      returnFocus={null}
      onSave={save}
      onClose={() => (open = false)}
      onNotify={() => {}}
    />
  {/if}
{:else}
  <p role="status">Dialog closed</p>
{/if}
