<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { Button, Alert, StatusChip } from '@cii/svelte';
  import { modules, permissions, initialRecords, singular } from '#lib/data.ts';
  import {
    isRecordModule,
    recordValue,
    type Module,
    type Role,
    type PortalRecord,
    type SortKey,
    type SavedView,
    type AuditEntry
  } from '#lib/model.ts';
  import {
    putRecord,
    archiveRecords,
    changeRecord,
    type RecordChanges
  } from '#lib/records.ts';
  import { loadWorkspace, saveWorkspace } from '#lib/persistence.ts';
  import { today, timestamp, money, date } from '#lib/format.ts';
  import { downloadCsv } from '#lib/reporting.ts';
  import { modalDialog } from '#lib/modal-dialog.ts';
  import RecordFormDialog from '#lib/components/RecordFormDialog.svelte';
  import RecordDrawer from '#lib/components/RecordDrawer.svelte';
  import Reports from '#lib/components/Reports.svelte';
  import Dashboard from '#lib/components/Dashboard.svelte';

  let records = $state(structuredClone(initialRecords));
  let module = $state<Module>('Dashboard');
  let role = $state<Role>('Admin');
  let dark = $state(false),
    menu = $state(false);
  let query = $state(''),
    status = $state('All statuses');
  let sort = $state<SortKey>('name'),
    ascending = $state(true),
    page = $state(1);
  let selected = $state<string[]>([]),
    compact = $state(false),
    showLocation = $state(true);
  let detail = $state<PortalRecord | null>(null),
    editing = $state<PortalRecord | null>(null);
  let modal = $state(false),
    toast = $state(''),
    storageError = $state(''),
    ready = $state(false);
  let storageAllowed = $state(false),
    recoveryNeeded = $state(false);
  let command = $state(false),
    globalQuery = $state('');
  let savedViews = $state<SavedView[]>([]),
    audit = $state<AuditEntry[]>([]);
  let modalReturnFocus = $state<HTMLElement | null>(null);
  const icons = ['◫', '♧', '▦', '▣', '♡', '▤', '▥', '⚙'];
  const canWrite = $derived(role !== 'Board Member');
  const allowed = $derived(permissions[role]);
  const rows = $derived(isRecordModule(module) ? records[module] : []);
  const filtered = $derived(
    rows
      .filter(
        (record) =>
          (status === 'All statuses' || record.status === status) &&
          Object.values(record)
            .join(' ')
            .toLowerCase()
            .includes(query.toLowerCase())
      )
      .toSorted(
        (a, b) =>
          String(a[sort]).localeCompare(String(b[sort]), undefined, {
            numeric: true
          }) * (ascending ? 1 : -1)
      )
  );
  const visible = $derived(filtered.slice((page - 1) * 5, page * 5));
  const visibleSelected = $derived(
    visible.filter((record) => selected.includes(record.id)).length
  );
  const selectionMixed = $derived(
    visibleSelected > 0 && visibleSelected < visible.length
  );
  const resultSummary = $derived(
    `${filtered.length} ${module.toLowerCase()} found. Showing ${filtered.length ? (page - 1) * 5 + 1 : 0}–${Math.min(page * 5, filtered.length)}. Sorted by ${sort}, ${ascending ? 'ascending' : 'descending'}. ${selected.length} selected.`
  );
  const openCases = $derived(
    records.Cases.filter((record) => record.status !== 'Closed')
  );
  const globalResults = $derived(
    globalQuery
      ? allowed
          .filter(isRecordModule)
          .flatMap((m) =>
            records[m]
              .filter((record) =>
                record.name.toLowerCase().includes(globalQuery.toLowerCase())
              )
              .map((record) => ({ m, r: record }))
          )
      : []
  );

  onMount(() => {
    try {
      const result = loadWorkspace(localStorage);
      if (result.status === 'loaded') {
        ({ records, audit, savedViews, dark } = result.snapshot);
        storageAllowed = true;
      } else if (result.status === 'empty') storageAllowed = true;
      else {
        storageError = result.message;
        recoveryNeeded = result.status === 'invalid';
      }
    } catch {
      storageError =
        'Browser storage is unavailable. Changes cannot be saved; export your work before leaving.';
    }
    ready = true;
    const initialModule =
      new URL(location.href).searchParams.get('module') ||
      decodeURIComponent(location.hash.slice(1));
    module =
      allowed.find((candidate) => candidate === initialModule) ?? 'Dashboard';
  });
  $effect(() => {
    if (ready && storageAllowed) {
      try {
        saveWorkspace(localStorage, { records, audit, savedViews, dark });
      } catch {
        storageError =
          'Changes could not be saved in this browser. Export your records before leaving.';
      }
    }
  });
  function replaceSavedWorkspace() {
    if (
      !confirm(
        'Replace the unreadable saved data with the current workspace? This cannot be undone.'
      )
    )
      return;
    storageAllowed = true;
    recoveryNeeded = false;
    storageError = '';
  }
  function notify(text: string) {
    toast = text;
    setTimeout(() => {
      if (toast === text) toast = '';
    }, 4500);
  }
  function navigate(next: Module) {
    if (!allowed.includes(next)) return;
    module = next;
    query = '';
    status = 'All statuses';
    page = 1;
    selected = [];
    detail = null;
    menu = false;
    void goto('?module=' + encodeURIComponent(next), {
      shallow: true,
      reset: false
    });
  }
  function changeRole() {
    if (!allowed.includes(module)) navigate('Dashboard');
    detail = null;
    modal = false;
    command = false;
    notify('Previewing ' + role + ' permissions');
  }
  function log(action: string, record: string) {
    audit = [
      { action, record, by: 'Sarah Mitchell', at: timestamp() },
      ...audit
    ];
  }
  function rememberFocus() {
    const active = document.activeElement;
    if (active instanceof HTMLElement && !active.closest('dialog'))
      modalReturnFocus = active;
  }
  function openCommand() {
    if (modal || detail) return;
    rememberFocus();
    command = true;
  }
  function create(record: PortalRecord | null = null) {
    if (!canWrite || !isRecordModule(module)) return;
    rememberFocus();
    editing = record;
    detail = null;
    modal = true;
  }
  function save(record: PortalRecord) {
    if (!canWrite || record.kind !== module) return;
    putRecord(records, record);
    log(editing ? 'Updated' : 'Created', record.name);
    modal = false;
    notify('Saved ' + singular[record.kind]);
  }
  function download(data: PortalRecord[], name: string) {
    downloadCsv(data, name);
    notify('CSV exported');
  }
  function toggleRow(id: string) {
    selected = selected.includes(id)
      ? selected.filter((value) => value !== id)
      : [...selected, id];
  }
  function bulkArchive() {
    if (!canWrite || !isRecordModule(module)) return;
    if (!confirm('Archive ' + selected.length + ' selected records?')) return;
    archiveRecords(records, module, selected, timestamp());
    log('Archived', selected.length + ' ' + module.toLowerCase());
    selected = [];
    notify('Selected records archived');
  }
  function updateDetail(changes: RecordChanges, action: string) {
    if (!canWrite || !detail) return;
    const next = changeRecord(detail, changes, timestamp());
    putRecord(records, next);
    detail = next;
    log(action, next.name);
    notify(action);
  }
  function saveView() {
    if (!isRecordModule(module)) return;
    const name = prompt('Name this saved view');
    if (name?.trim()) {
      savedViews = [
        ...savedViews,
        { name: name.trim(), module, query, status, sort }
      ];
      notify('View saved');
    }
  }
  function sortBy(key: SortKey) {
    if (sort === key) ascending = !ascending;
    else {
      sort = key;
      ascending = true;
    }
  }
  function showRecord(record: PortalRecord) {
    rememberFocus();
    detail = record;
  }
</script>

<svelte:head
  ><title>{module} · Common Ground</title><meta
    name="description"
    content="Community organisation operations portal — members, programs, events, donations and support."
  /></svelte:head
>
<svelte:window
  onpopstate={() => {
    const next =
      new URL(location.href).searchParams.get('module') || 'Dashboard';
    module = allowed.find((m) => m === next) ?? 'Dashboard';
    detail = null;
    selected = [];
    query = '';
    status = 'All statuses';
    page = 1;
  }}
  onkeydown={(e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      if (!modal && !detail) {
        if (command) command = false;
        else openCommand();
      }
    }
    if (e.key === 'Escape' && !modal && !detail && !command) menu = false;
  }}
/>
<div
  class:dark
  class="app"
  data-cii-theme={dark ? 'dark' : 'light'}
  data-ready={ready}
  aria-busy={!ready}
>
  <a class="skip" href="#main">Skip to content</a>
  <aside class:mobile-open={menu}>
    <a
      class="brand"
      href="?module=Dashboard"
      onclick={(e) => {
        e.preventDefault();
        navigate('Dashboard');
      }}
      ><span class="brand-mark">c<span>g</span></span><span
        >Common Ground<small>COMMUNITY PORTAL</small></span
      ></a
    >
    <div class="workspace">
      <span class="workspace-icon">C</span>
      <div>Community in action<small>Sydney, Australia</small></div>
      <span>⌄</span>
    </div>
    <p class="nav-label">WORKSPACE</p>
    <nav aria-label="Main navigation">
      {#each allowed as m (m)}<a
          href={'?module=' + encodeURIComponent(m)}
          class:active={module === m}
          aria-current={module === m ? 'page' : undefined}
          onclick={(e) => {
            e.preventDefault();
            navigate(m);
          }}
          ><span class="nav-icon" aria-hidden="true"
            >{icons[modules.indexOf(m)]}</span
          >{m}{#if m === 'Cases'}<span class="count">{openCases.length}</span
            >{/if}</a
        >{/each}
    </nav>
    <div class="sidebar-bottom">
      <div class="impact">
        <span>✧</span><strong>Small actions. Real impact.</strong>
        <p>A little more connected,<br />a stronger community.</p>
      </div>
      <div class="profile">
        <span class="avatar">SM</span>
        <div>Sarah Mitchell<small>{role}</small></div>
        <span class="online" title="Demo profile"></span>
      </div>
    </div>
  </aside>
  <div class="main-shell">
    <header class="topbar">
      <button
        class="icon mobile-toggle"
        aria-label="Toggle navigation"
        onclick={() => (menu = !menu)}>☰</button
      ><span class="breadcrumb"
        >Workspace <span>/</span> <strong>{module}</strong></span
      >
      <div class="top-actions">
        <button class="search-trigger" onclick={openCommand}
          ><span>⌕</span> Search anything <kbd>⌘ K</kbd></button
        ><button
          class="icon"
          aria-label={dark ? 'Use light theme' : 'Use dark theme'}
          onclick={() => (dark = !dark)}>{dark ? '☀' : '☾'}</button
        ><button
          class="icon notification"
          aria-label="View activity notifications"
          onclick={() => {
            navigate('Dashboard');
            document
              .getElementById('activity')
              ?.scrollIntoView({ behavior: 'smooth' });
          }}>♧<i></i></button
        ><span class="avatar small">SM</span>
      </div>
    </header>
    <main id="main" tabindex="-1">
      {#if storageError}<Alert tone="danger" role="alert"
          >{storageError}{#if recoveryNeeded}<button
              onclick={replaceSavedWorkspace}
              >Save current workspace instead</button
            >{/if}</Alert
        >{/if}
      <div class="demo-strip">
        <span
          ><span class="live-dot"></span> Demo workspace · {storageAllowed
            ? 'changes saved on this device'
            : 'automatic saving paused'}</span
        ><label
          >Preview role <select
            bind:value={role}
            disabled={!ready}
            onchange={(e) => {
              role = e.currentTarget.value as Role;
              changeRole();
            }}
            >{#each Object.keys(permissions) as r (r)}<option>{r}</option
              >{/each}</select
          ></label
        >
      </div>
      {#if module === 'Dashboard'}
        <Dashboard
          {records}
          {allowed}
          {role}
          {audit}
          onNavigate={(next, filter) => {
            navigate(next);
            if (filter) status = filter;
          }}
          onCreate={(next) => {
            navigate(next);
            create();
          }}
          onShowRecord={(record) => {
            navigate(record.kind);
            showRecord(record);
          }}
          onQuickAdd={openCommand}
        />
      {:else if module === 'Reports'}
        <Reports {records} {allowed} {role} onDownload={download} />
      {:else}
        <div class="page-heading">
          <div>
            <p class="eyebrow">COMMUNITY IN ACTION</p>
            <h1>{module}</h1>
            <p>
              {{
                Members: 'People at the heart of your community.',
                Programs: 'Meaningful services. Lasting connections.',
                Events: 'Make room for your community to come together.',
                Donations: 'Every act of generosity makes a difference.',
                Cases: 'The right support, at the right time.',
                Administration: 'Manage your team and their access.'
              }[module]}
            </p>
          </div>
          <div class="heading-actions">
            <button onclick={() => download(filtered, module.toLowerCase())}
              >↓ Export CSV</button
            >{#if canWrite}<Button class="primary" onclick={() => create()}
                >+ Add {singular[module]}</Button
              >{/if}
          </div>
        </div>
        <p
          class="sr-only"
          aria-live="polite"
          aria-atomic="true"
          data-testid="record-results"
        >
          {resultSummary}
        </p>
        <section class="panel record-panel">
          <div class="table-tabs">
            <button
              class:chosen={status === 'All statuses'}
              onclick={() => {
                status = 'All statuses';
                page = 1;
              }}
              >All {module.toLowerCase()}
              <span class="number">{rows.length}</span></button
            >{#each [...new Set(rows.map((r) => r.status))].slice(0, 3) as s (s)}<button
                class:chosen={status === s}
                onclick={() => {
                  status = s;
                  page = 1;
                }}>{s}</button
              >{/each}
          </div>
          <div class="controls">
            <label class="search-field"
              ><span>⌕</span><input
                aria-label={'Search ' + module.toLowerCase()}
                placeholder={'Search ' + module.toLowerCase() + '…'}
                bind:value={query}
                oninput={() => (page = 1)}
              /></label
            ><select
              aria-label="Filter by status"
              bind:value={status}
              onchange={() => (page = 1)}
              ><option>All statuses</option
              >{#each [...new Set(rows.map((r) => r.status))] as s (s)}<option
                  >{s}</option
                >{/each}</select
            >
            <details class="view-options">
              <summary>View options</summary>
              <div>
                <label
                  ><input type="checkbox" bind:checked={showLocation} /> Show {module ===
                  'Cases'
                    ? 'assignee'
                    : 'location'}</label
                ><label
                  ><input type="checkbox" bind:checked={compact} /> Compact rows</label
                ><button onclick={saveView}>Save current view</button
                >{#each savedViews.filter((v) => v.module === module) as v (v)}<button
                    onclick={() => {
                      query = v.query;
                      status = v.status;
                      sort = v.sort;
                      page = 1;
                    }}>{v.name}</button
                  >{/each}
              </div>
            </details>
          </div>
          {#if selected.length}<div class="selection-bar">
              <strong>{selected.length} selected</strong><button
                onclick={() =>
                  download(
                    rows.filter((r) => selected.includes(r.id)),
                    module.toLowerCase() + '-selected'
                  )}>Export selected</button
              >{#if canWrite}<button class="danger" onclick={bulkArchive}
                  >Archive selected</button
                >{/if}<button onclick={() => (selected = [])}>Clear</button>
            </div>{/if}
          <div class="table-scroll">
            <table class:compact>
              <caption class="sr-only">{module} records</caption>
              <thead
                ><tr
                  ><th scope="col" class="check"
                    ><input
                      type="checkbox"
                      aria-label="Select all visible records"
                      checked={visible.length > 0 &&
                        visibleSelected === visible.length}
                      indeterminate={selectionMixed}
                      onchange={(e) =>
                        (selected = e.currentTarget.checked
                          ? [
                              ...new Set([
                                ...selected,
                                ...visible.map((r) => r.id)
                              ])
                            ]
                          : selected.filter(
                              (id) => !visible.some((r) => r.id === id)
                            ))}
                    /></th
                  ><th
                    scope="col"
                    aria-sort={sort === 'name'
                      ? ascending
                        ? 'ascending'
                        : 'descending'
                      : undefined}
                    ><button
                      aria-label={'Sort by name, ' +
                        (sort === 'name' && ascending
                          ? 'descending'
                          : 'ascending')}
                      onclick={() => sortBy('name')}
                      >{module === 'Cases'
                        ? 'Case'
                        : module === 'Donations'
                          ? 'Donor'
                          : 'Name'} ↕</button
                    ></th
                  ><th
                    scope="col"
                    aria-sort={sort === 'status'
                      ? ascending
                        ? 'ascending'
                        : 'descending'
                      : undefined}
                    ><button
                      aria-label={'Sort by status, ' +
                        (sort === 'status' && ascending
                          ? 'descending'
                          : 'ascending')}
                      onclick={() => sortBy('status')}>Status ↕</button
                    ></th
                  ><th scope="col"
                    >{module === 'Donations'
                      ? 'Amount'
                      : module === 'Administration'
                        ? 'Role'
                        : 'Type'}</th
                  >{#if showLocation}<th scope="col"
                      >{module === 'Cases'
                        ? 'Assignee'
                        : module === 'Donations'
                          ? 'Campaign'
                          : 'Location'}</th
                    >{/if}<th
                    scope="col"
                    aria-sort={sort === 'date'
                      ? ascending
                        ? 'ascending'
                        : 'descending'
                      : undefined}
                    ><button
                      aria-label={'Sort by date, ' +
                        (sort === 'date' && ascending
                          ? 'descending'
                          : 'ascending')}
                      onclick={() => sortBy('date')}
                      >{module === 'Cases' ? 'Due date' : 'Date'} ↕</button
                    ></th
                  ><th scope="col"><span class="sr-only">Actions</span></th></tr
                ></thead
              ><tbody
                >{#each visible as r (r.id)}<tr
                    ><td
                      ><input
                        type="checkbox"
                        aria-label={'Select ' + r.name}
                        checked={selected.includes(r.id)}
                        onchange={() => toggleRow(r.id)}
                      /></td
                    ><td
                      ><button class="record-name" onclick={() => showRecord(r)}
                        >{#if module === 'Members' || module === 'Administration'}<span
                            class="avatar row-avatar"
                            >{r.name
                              .split(' ')
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join('')}</span
                          >{/if}<span
                          ><strong>{r.name}</strong><small
                            >{recordValue(r, 'email') || r.id}</small
                          ></span
                        ></button
                      ></td
                    ><td
                      ><StatusChip
                        tone={['Active', 'Acknowledged'].includes(r.status)
                          ? 'success'
                          : ['Pending', 'Needs receipt', 'Open'].includes(
                                r.status
                              )
                            ? 'warning'
                            : 'neutral'}>{r.status}</StatusChip
                      ></td
                    ><td
                      >{module === 'Donations'
                        ? money(recordValue(r, 'amount'))
                        : r.type || '—'}</td
                    >{#if showLocation}<td>{r.location || '—'}</td>{/if}<td
                      class:overdue={module === 'Cases' &&
                        r.date < today() &&
                        r.status !== 'Closed'}>{date(r.date)}</td
                    ><td
                      ><button class="text-button" onclick={() => showRecord(r)}
                        >View →</button
                      ></td
                    ></tr
                  >{:else}<tr
                    ><td colspan="7"
                      ><div class="empty">
                        <strong>No {module.toLowerCase()} found</strong>
                        <p>Try another search or clear your filters.</p>
                        <button
                          onclick={() => {
                            query = '';
                            status = 'All statuses';
                          }}>Clear filters</button
                        >
                      </div></td
                    ></tr
                  >{/each}</tbody
              >
            </table>
          </div>
          <div class="table-footer">
            <span
              >{filtered.length ? (page - 1) * 5 + 1 : 0}–{Math.min(
                page * 5,
                filtered.length
              )} of {filtered.length} records</span
            >
            <div>
              <button disabled={page === 1} onclick={() => page--}
                >← Previous</button
              ><span
                >Page {page} of {Math.max(
                  1,
                  Math.ceil(filtered.length / 5)
                )}</span
              ><button
                disabled={page * 5 >= filtered.length}
                onclick={() => page++}>Next →</button
              >
            </div>
          </div>
        </section>
        {#if module === 'Administration'}<section class="panel">
            <div class="panel-heading">
              <h2>Role permissions</h2>
              <span class="subtle">Demo visibility model</span>
            </div>
            <div class="table-scroll">
              <table>
                <thead
                  ><tr><th>Role</th><th>Visible modules</th><th>Access</th></tr
                  ></thead
                ><tbody
                  >{#each Object.entries(permissions) as [r, items] (r)}<tr
                      ><td><strong>{r}</strong></td><td>{items.join(', ')}</td
                      ><td
                        >{r === 'Board Member'
                          ? 'Read only'
                          : 'Create and update'}</td
                      ></tr
                    >{/each}</tbody
                >
              </table>
            </div>
          </section>
          <section class="panel">
            <div class="panel-heading"><h2>Audit log</h2></div>
            <div class="timeline">
              {#each audit as a (a)}<div>
                  <span class="timeline-dot"></span>
                  <p>
                    <strong>{a.action}: {a.record}</strong><small
                      >{a.by} · {new Date(a.at).toLocaleString('en-AU', {
                        timeZone: 'Australia/Sydney'
                      })}</small
                    >
                  </p>
                </div>{:else}<p>No changes recorded yet.</p>{/each}
            </div>
          </section>{/if}
      {/if}
      <footer>
        Common Ground <span>Made for the people who bring people together.</span
        ><small>Demo data · Australia/Sydney</small>
      </footer>
    </main>
  </div>
  {#if detail}
    <RecordDrawer
      record={detail}
      returnFocus={modalReturnFocus}
      {records}
      {audit}
      {canWrite}
      onClose={() => (detail = null)}
      onEdit={create}
      onUpdate={updateDetail}
    />
  {/if}
  {#if modal && isRecordModule(module)}
    <RecordFormDialog
      {module}
      {editing}
      returnFocus={modalReturnFocus}
      members={records.Members}
      onSave={save}
      onClose={() => (modal = false)}
      onNotify={notify}
    />
  {/if}
  {#if command}<dialog
      class="command"
      aria-labelledby="command-title"
      use:modalDialog={{ initialFocus: 'input', returnFocus: modalReturnFocus }}
      oncancel={(event) => {
        event.preventDefault();
        command = false;
      }}
    >
      <div class="drawer-top">
        <h2 id="command-title">Find your next step</h2>
        <button
          class="icon"
          aria-label="Close search"
          onclick={() => (command = false)}>✕</button
        >
      </div>
      <label class="search-field"
        ><span>⌕</span><input
          aria-label="Search all accessible records"
          placeholder="Search people, events, cases…"
          bind:value={globalQuery}
        /></label
      >{#if globalQuery}{#each globalResults.slice(0, 8) as result (result.m + ':' + result.r.id)}<button
            class="command-item"
            onclick={() => {
              navigate(result.m);
              showRecord(result.r);
              command = false;
            }}>{result.r.name}<small>{result.m} →</small></button
          >{:else}<p class="empty">
            No matching records. Try a different name.
          </p>{/each}{:else}<p class="eyebrow">QUICK ACTIONS</p>
        {#each allowed.filter((m) => singular[m]) as m (m)}<button
            class="command-item"
            onclick={() => {
              navigate(m);
              command = false;
              if (canWrite) create();
            }}
            >+ {canWrite
              ? 'Add ' + singular[m]
              : 'View ' + m.toLowerCase()}<span>↗</span></button
          >{/each}{/if}
    </dialog>{/if}
  {#if toast}<div class="toast" role="status">
      <span>✓</span>{toast}<button
        aria-label="Dismiss message"
        onclick={() => (toast = '')}>✕</button
      >
    </div>{/if}
</div>
