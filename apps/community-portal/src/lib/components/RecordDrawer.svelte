<script lang="ts">
  import { Button, StatusChip, Alert } from '@cii/svelte';
  import { onDestroy } from 'svelte';
  import { backendError } from '../backend/types.ts';
  import { singular } from '../data.ts';
  import {
    recordValue,
    type PortalRecord,
    type PortalRecords,
    type AuditEntry
  } from '../model.ts';
  import type { RecordChanges } from '../records.ts';
  import { modalDialog } from '../modal-dialog.ts';
  import { money, date } from '../format.ts';
  let {
    record: detail,
    records,
    audit,
    canWrite,
    pending = false,
    onClose,
    onEdit,
    onUpdate,
    returnFocus
  }: {
    record: PortalRecord;
    records: PortalRecords;
    audit: AuditEntry[];
    canWrite: boolean;
    pending?: boolean;
    onClose: () => void;
    onEdit: (record: PortalRecord) => void;
    onUpdate: (changes: RecordChanges, action: string) => Promise<void>;
    returnFocus: HTMLElement | null;
  } = $props();
  const module = $derived(detail.kind);
  const tabs = ['Overview', 'Activity', 'Notes', 'Related records'];
  let tab = $state('Overview');
  const tabId = (name: string) => 'record-tab-' + tabs.indexOf(name);
  function moveTab(event: KeyboardEvent, current: string) {
    const index = tabs.indexOf(current);
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index + tabs.length - 1) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : undefined;
    if (next === undefined) return;
    event.preventDefault();
    tab = tabs[next];
    document.getElementById(tabId(tab))?.focus();
  }
  let updateError = $state('');
  let saving = $state(false);
  const busy = $derived(pending || saving);
  let disposed = false;
  onDestroy(() => {
    disposed = true;
  });
  async function update(
    changes: RecordChanges,
    action: string
  ): Promise<boolean> {
    if (busy) return false;
    saving = true;
    updateError = '';
    try {
      await onUpdate(changes, action);
      return !disposed;
    } catch (error) {
      if (!disposed) updateError = backendError(error).message;
      return false;
    } finally {
      if (!disposed) saving = false;
    }
  }
  let note = $state('');
  let assignment = $state('');
</script>

<dialog
  class="drawer"
  aria-labelledby="detail-title"
  use:modalDialog={{
    initialFocus: '[aria-label="Close record"]',
    returnFocus,
    dismissOnBackdrop: onClose
  }}
  oncancel={(event) => {
    event.preventDefault();
    onClose();
  }}
>
  <div class="drawer-top">
    <span>{module} / {detail.id}</span><button
      class="icon"
      aria-label="Close record"
      onclick={() => onClose()}>✕</button
    >
  </div>
  {#if updateError}<Alert tone="danger" role="alert">{updateError}</Alert>{/if}
  <StatusChip>{detail.status}</StatusChip>
  <h2 id="detail-title">{detail.name}</h2>
  <p class="subtle">{recordValue(detail, 'email') || detail.type}</p>
  {#if canWrite}<Button
      class="primary"
      disabled={busy}
      onclick={() => onEdit(detail)}>Edit {singular[module]}</Button
    >{/if}
  <div class="detail-tabs" role="tablist" aria-label="Record details">
    {#each tabs as t (t)}<button
        role="tab"
        id={tabId(t)}
        aria-controls="record-tab-panel"
        tabindex={tab === t ? 0 : -1}
        onkeydown={(event) => moveTab(event, t)}
        aria-selected={tab === t}
        onclick={() => (tab = t)}>{t}</button
      >{/each}
  </div>
  <div
    id="record-tab-panel"
    role="tabpanel"
    aria-labelledby={tabId(tab)}
    tabindex="0"
  >
    {#if tab === 'Overview'}<dl>
        {#each Object.entries(detail).filter(([k, value]) => value !== undefined && !['kind', 'notes', 'updatedBy', 'updatedAt'].includes(k)) as [key, value] (key)}<div
          >
            <dt>{key.replace(/([A-Z])/g, ' $1')}</dt>
            <dd>
              {key === 'amount'
                ? money(value)
                : key === 'date'
                  ? date(String(value))
                  : String(value)}
            </dd>
          </div>{/each}
      </dl>
      {#if canWrite && detail.kind === 'Cases'}<button
          disabled={busy}
          aria-busy={busy}
          onclick={() =>
            update(
              { status: detail.status === 'Closed' ? 'Open' : 'Closed' },
              detail.status === 'Closed' ? 'Reopened case' : 'Closed case'
            )}
          >{detail.status === 'Closed' ? 'Reopen case' : 'Close case'}</button
        >{/if}
      {#if canWrite && module === 'Donations' && detail.status !== 'Acknowledged'}<button
          disabled={busy}
          aria-busy={busy}
          onclick={() =>
            update({ status: 'Acknowledged' }, 'Marked donation acknowledged')}
          >Mark acknowledged</button
        >{/if}
      {#if canWrite && detail.kind === 'Events'}<button
          disabled={busy}
          aria-busy={busy}
          onclick={() =>
            update(
              {
                attendees: Number(recordValue(detail, 'attendees') ?? 0) + 1
              },
              'Recorded attendance'
            )}>Check in attendee</button
        >{/if}
    {:else if tab === 'Activity'}<div class="timeline">
        {#each audit.filter((a) => a.record === detail.name) as a (a)}<div>
            <span class="timeline-dot"></span>
            <p>
              <strong>{a.action}</strong><small>{a.by} · {date(a.at)}</small>
            </p>
          </div>{:else}<p>No updates recorded in this workspace.</p>{/each}
      </div>
    {:else if tab === 'Notes'}<p class="note-text">
        {detail.notes || 'No notes yet.'}
      </p>
      {#if canWrite}<label
          >Add note<textarea disabled={busy} bind:value={note} rows="4"
          ></textarea></label
        ><Button
          class="primary"
          disabled={busy || !note.trim()}
          loading={saving}
          onclick={async () => {
            if (
              await update(
                {
                  notes:
                    (detail.notes ? detail.notes + '\n\n' : '') + note.trim()
                },
                'Added note'
              )
            )
              note = '';
          }}>Save note</Button
        >{/if}
    {:else}<h3>Connected records</h3>
      {#if detail.kind === 'Members'}{#each records.Programs.filter((p) => recordValue(detail, 'programId') === p.id) as p (p.id)}<p
          >
            {p.name}
          </p>{:else}<p>No program assigned.</p>{/each}{#if canWrite}<label
            >Assign to a program<select disabled={busy} bind:value={assignment}
              ><option value="">Choose a program</option
              >{#each records.Programs as p (p.id)}<option value={p.id}
                  >{p.name}</option
                >{/each}</select
            ></label
          ><button
            disabled={busy || !assignment}
            onclick={() =>
              update({ programId: assignment }, 'Assigned program')}
            >Assign program</button
          >{/if}{:else if detail.kind === 'Cases' && detail.memberId}<p>
          Member: {records.Members.find(
            (r) => r.id === recordValue(detail, 'memberId')
          )?.name || detail.memberId}
        </p>{:else}<p>No linked records yet.</p>{/if}{/if}
  </div>
  <p class="audit-meta">
    Updated by {detail.updatedBy || 'Demo data'}<br />{detail.updatedAt
      ? new Date(detail.updatedAt).toLocaleString('en-AU', {
          timeZone: 'Australia/Sydney'
        })
      : date(detail.date)} · Sydney time
  </p>
</dialog>
