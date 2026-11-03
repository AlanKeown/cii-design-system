<script lang="ts">
  import { tick, untrack, onDestroy } from 'svelte';
  import { modalDialog } from '../modal-dialog.ts';
  import { Alert, Button, TextField } from '@cii/svelte';
  import { permissions, singular } from '../data.ts';
  import {
    statuses,
    type RecordForm,
    type RecordModule,
    type PortalRecord,
    type MemberRecord,
    type FormErrors,
    type ValidationField
  } from '../model.ts';
  import { emptyForm, recordForm, validateForm } from '../records.ts';
  import { loadDraft, saveDraft } from '../persistence.ts';
  import { backendError } from '../backend/types.ts';
  import { today } from '../format.ts';

  let {
    allowDrafts = true,
    module,
    editing,
    members,
    onSave,
    onClose,
    onNotify,
    returnFocus
  }: {
    allowDrafts?: boolean;
    module: RecordModule;
    editing: PortalRecord | null;
    members: MemberRecord[];
    onSave: (form: RecordForm) => Promise<void>;
    onClose: () => void;
    onNotify: (message: string) => void;
    returnFocus: HTMLElement | null;
  } = $props();
  // The parent mounts a fresh dialog for each create/edit operation.
  let form = $state(
    untrack(() => (editing ? recordForm(editing) : emptyForm(module, today())))
  );
  let errors = $state<FormErrors>({});
  let pending = $state(false);
  let saveError = $state('');
  let saveErrorSummary = $state<HTMLDivElement>();
  let disposed = false;
  onDestroy(() => {
    disposed = true;
  });
  let dialog: HTMLDialogElement;
  let summary = $state<HTMLDivElement>();
  function validate(field: ValidationField) {
    const next = { ...errors };
    const message = validateForm(module, form)[field];
    if (message) next[field] = message;
    else delete next[field];
    errors = next;
  }
  async function save() {
    if (pending) return;
    saveError = '';
    errors = validateForm(module, form);
    if (Object.keys(errors).length) {
      await tick();
      summary?.focus();
      return;
    }
    pending = true;
    try {
      await onSave($state.snapshot(form));
    } catch (error) {
      if (disposed) return;
      const failure = backendError(error);
      errors = failure.fieldErrors ?? {};
      saveError = failure.message;
      await tick();
      if (!disposed) (summary ?? saveErrorSummary)?.focus();
    } finally {
      if (!disposed) pending = false;
    }
  }
  function draft() {
    try {
      saveDraft(localStorage, module, form);
      onNotify('Draft saved on this device');
    } catch {
      onNotify('Could not save draft. Check browser storage.');
    }
  }
  function restoreDraft() {
    try {
      const saved = loadDraft(localStorage, module);
      if (saved) {
        form = saved;
        errors = {};
        onNotify('Draft restored');
      } else onNotify('No saved draft for this module');
    } catch {
      onNotify('Could not restore draft. Your current entries were kept.');
    }
  }
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="record-form-title"
  aria-describedby="record-form-hint"
  use:modalDialog={{ initialFocus: '[aria-label="Close form"]', returnFocus }}
  oncancel={(event) => {
    event.preventDefault();
    onClose();
  }}
>
  <form
    onsubmit={(e) => {
      e.preventDefault();
      save();
    }}
    novalidate
  >
    <div class="drawer-top">
      <p class="eyebrow">
        {editing ? 'UPDATE RECORD' : 'GROW YOUR COMMUNITY'}
      </p>
      <button
        type="button"
        class="icon"
        aria-label="Close form"
        onclick={() => {
          onClose();
        }}>✕</button
      >
    </div>
    <h2 id="record-form-title">
      {editing ? 'Edit' : 'Add'}
      {singular[module]}
    </h2>
    <p id="record-form-hint" class="subtle">Fields marked * are required.</p>
    {#if Object.keys(errors).length}<div
        bind:this={summary}
        tabindex="-1"
        role="region"
        aria-label="Record validation errors"
      >
        <Alert
          tone="danger"
          role="alert"
          title="Couldn’t save changes. Check these fields:"
          ><ul>
            {#each Object.entries(errors) as [field, error] (field)}<li>
                <a
                  href={'#field-' + field}
                  onclick={(event) => {
                    event.preventDefault();
                    dialog
                      .querySelector<HTMLElement>('#field-' + field)
                      ?.focus();
                  }}>{error}</a
                >
              </li>{/each}
          </ul></Alert
        >
      </div>{/if}
    {#if saveError}<div bind:this={saveErrorSummary} tabindex="-1">
        <Alert tone="danger" role="alert">{saveError}</Alert>
      </div>{/if}
    <fieldset disabled={pending} class="form-fields">
      <div class="form-grid">
        <TextField
          class="full"
          id="field-name"
          label="Name or title"
          required
          bind:value={form.name}
          onblur={() => validate('name')}
          error={errors.name}
        />{#if ['Members', 'Administration'].includes(module)}<TextField
            class="full"
            id="field-email"
            label="Email"
            type="email"
            bind:value={form.email}
            onblur={() => validate('email')}
            error={errors.email}
          />{/if}<label
          >Status<select id="field-status" bind:value={form.status}
            >{#each statuses[module] as s (s)}<option>{s}</option
              >{/each}</select
          ></label
        ><label
          >{module === 'Administration'
            ? 'Role'
            : 'Type'}{#if module === 'Administration'}<select
              id="field-type"
              bind:value={form.type}
              >{#each Object.keys(permissions) as r (r)}<option>{r}</option
                >{/each}</select
            >{:else}<input id="field-type" bind:value={form.type} />{/if}</label
        ><label
          >{module === 'Cases'
            ? 'Assignee'
            : module === 'Donations'
              ? 'Campaign'
              : 'Location'}<input bind:value={form.location} /></label
        ><label
          >{module === 'Cases' ? 'Due date' : 'Date'} *<input
            id="field-date"
            type="date"
            bind:value={form.date}
            onblur={() => validate('date')}
            required
            aria-invalid={!!errors.date}
            aria-describedby={errors.date ? 'field-date-error' : undefined}
          />{#if errors.date}<small id="field-date-error" class="error"
              >{errors.date}</small
            >{/if}</label
        >{#if module === 'Donations'}<label class="full"
            >Amount (AUD) *<input
              id="field-amount"
              type="number"
              min="0.01"
              step="0.01"
              bind:value={form.amount}
              onblur={() => validate('amount')}
              required
              aria-invalid={!!errors.amount}
              aria-describedby={errors.amount
                ? 'field-amount-error'
                : undefined}
            />{#if errors.amount}<small id="field-amount-error" class="error"
                >{errors.amount}</small
              >{/if}</label
          >{/if}{#if module === 'Programs'}
          {#each [{ key: 'capacity', label: 'Capacity' }, { key: 'participants', label: 'Participants' }] as field (field.key)}
            <label
              >{field.label} *<input
                id={'field-' + field.key}
                type="number"
                min="0"
                step="1"
                bind:value={form[field.key as 'capacity' | 'participants']}
                onblur={() =>
                  validate(field.key as 'capacity' | 'participants')}
                required
                aria-invalid={!!errors[
                  field.key as 'capacity' | 'participants'
                ]}
                aria-describedby={errors[
                  field.key as 'capacity' | 'participants'
                ]
                  ? 'field-' + field.key + '-error'
                  : undefined}
              />
              {#if errors[field.key as 'capacity' | 'participants']}<small
                  id={'field-' + field.key + '-error'}
                  class="error"
                  >{errors[field.key as 'capacity' | 'participants']}</small
                >{/if}</label
            >
          {/each}
        {/if}{#if module === 'Events'}
          <label
            >Attendees *<input
              id="field-attendees"
              type="number"
              min="0"
              step="1"
              bind:value={form.attendees}
              onblur={() => validate('attendees')}
              required
              aria-invalid={!!errors.attendees}
              aria-describedby={errors.attendees
                ? 'field-attendees-error'
                : undefined}
            />
            {#if errors.attendees}<small
                id="field-attendees-error"
                class="error">{errors.attendees}</small
              >{/if}</label
          >
        {/if}{#if module === 'Cases'}<label
            >Priority<select id="field-priority" bind:value={form.priority}
              ><option>Normal</option><option>High</option><option
                >Urgent</option
              ></select
            ></label
          ><label
            >Linked member<select bind:value={form.memberId}
              ><option value="">No member</option
              >{#each members as r (r.id)}<option value={r.id}>{r.name}</option
                >{/each}</select
            ></label
          >{/if}<label class="full"
          >Notes<textarea rows="3" bind:value={form.notes}></textarea></label
        >
      </div>
    </fieldset>
    <div class="form-footer">
      {#if allowDrafts}<button
          type="button"
          disabled={pending}
          onclick={restoreDraft}>Restore draft</button
        ><button type="button" disabled={pending} onclick={draft}
          >Save draft</button
        >{/if}<Button
        class="primary"
        type="submit"
        disabled={pending}
        loading={pending}
        >{pending ? 'Saving…' : 'Save ' + singular[module]}</Button
      >
    </div>
  </form>
</dialog>

<style>
  .form-fields {
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
  }
</style>
