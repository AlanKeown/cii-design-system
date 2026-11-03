<script lang="ts">
  import { Button, StatusChip } from '@cii/svelte';
  import type {
    Module,
    Role,
    PortalRecords,
    PortalRecord,
    RecordModule,
    AuditEntry
  } from '../model.ts';
  import { date, money, month, today } from '../format.ts';
  let {
    displayName = 'Sarah Mitchell',
    records,
    allowed,
    role,
    audit,
    onNavigate,
    onCreate,
    onShowRecord,
    onQuickAdd
  }: {
    displayName?: string;
    records: PortalRecords;
    allowed: Module[];
    role: Role;
    audit: AuditEntry[];
    onNavigate: (module: Module, status?: string) => void;
    onCreate: (module: RecordModule) => void;
    onShowRecord: (record: PortalRecord) => void;
    onQuickAdd: () => void;
  } = $props();
  const canWrite = $derived(role !== 'Board Member');
  const openCases = $derived(
    records.Cases.filter((record) => record.status !== 'Closed')
  );
  const activeMembers = $derived(
    records.Members.filter((record) => record.status === 'Active')
  );
</script>

<div class="page-heading">
  <div>
    <p class="eyebrow">YOUR COMMUNITY, AT A GLANCE</p>
    <h1>
      Good morning, {displayName.split(' ')[0]} <span class="wave">☀</span>
    </h1>
    <p>Here’s what’s happening across your community.</p>
  </div>
  <div class="heading-actions">
    <span class="date-label">{date(today())}</span>{#if canWrite}<Button
        class="primary"
        onclick={onQuickAdd}>+ Quick add</Button
      >{/if}
  </div>
</div>
<div class="metrics">
  {#each [{ title: 'Active members', value: activeMembers.length, sub: 'Connected to your community', symbol: '♧', target: 'Members' as const, filter: 'Active', color: 'blue' }, { title: 'Open cases', value: openCases.length, sub: 'Support that makes a difference', symbol: '▤', target: 'Cases' as const, color: 'lilac' }, { title: 'Upcoming events', value: records.Events.filter((r) => r.date >= today()).length, sub: 'More opportunities to connect', symbol: '▣', target: 'Events' as const, color: 'peach' }, { title: 'Donations this month', value: money(records.Donations.filter( (r) => r.date.startsWith(today().slice(0, 7)) ).reduce((s, r) => s + (r.amount ?? 0), 0)), sub: 'Every contribution counts', symbol: '♡', target: 'Donations' as const, color: 'green' }].filter( (k) => allowed.includes(k.target) ) as k (k.target)}
    <button
      class="metric"
      onclick={() => {
        onNavigate(k.target, k.filter);
      }}
      ><div>
        <span>{k.title}</span><span class={'metric-icon ' + k.color}
          >{k.symbol}</span
        >
      </div>
      <strong>{k.value}</strong><small>{k.sub}</small><span class="metric-link"
        >View {k.target.toLowerCase()} ↗</span
      ></button
    >{/each}
</div>
<div class="dashboard-grid">
  <div>
    <section class="panel priorities">
      <div class="panel-heading">
        <div>
          <h2>
            Needs your attention <span class="number"
              >{(allowed.includes('Cases') ? openCases.length : 0) +
                (allowed.includes('Donations')
                  ? records.Donations.filter(
                      (r) => r.status === 'Needs receipt'
                    ).length
                  : 0)}</span
            >
          </h2>
          <p>A few things where you can make a difference.</p>
        </div>
        <span class="attention-icon">◷</span>
      </div>
      {#if allowed.includes('Cases')}{#each openCases as r (r.id)}<button
            class="task-row"
            onclick={() => {
              onShowRecord(r);
            }}
            ><span class="task-symbol">!</span>
            <div>
              <strong>{r.name}</strong><small
                >{r.id} · {r.location} · Due {date(r.date)}</small
              >
            </div>
            <StatusChip tone={r.date < today() ? 'warning' : 'neutral'}
              >{r.date < today() ? 'Overdue' : r.priority}</StatusChip
            ><span>↗</span></button
          >{/each}{/if}
      {#if allowed.includes('Donations')}{#each records.Donations.filter((r) => r.status === 'Needs receipt') as r (r.id)}<button
            class="task-row"
            onclick={() => {
              onShowRecord(r);
            }}
            ><span class="task-symbol purple">♡</span>
            <div>
              <strong>Thank {r.name} for their support</strong><small
                >{money(r.amount)} donation · {date(r.date)}</small
              >
            </div>
            <StatusChip tone="accent">Needs receipt</StatusChip><span>↗</span
            ></button
          >{/each}{/if}
      {#if role === 'Board Member'}<div class="empty">
          <strong>Your community snapshot is ready</strong>
          <p>Explore the latest operational reports.</p>
          <button onclick={() => onNavigate('Reports')}>View reports →</button>
        </div>{/if}
    </section>
    <section class="panel" id="activity">
      <div class="panel-heading">
        <div>
          <h2>Recent activity</h2>
          <p>The latest from your team.</p>
        </div>
        <span class="subtle">Sydney time</span>
      </div>
      <div class="timeline">
        {#each audit.slice(0, 5) as a (a)}<div>
            <span class="timeline-dot"></span>
            <p>
              <strong>{a.action}: {a.record}</strong><small
                >{a.by} · {date(a.at)}</small
              >
            </p>
          </div>{:else}<div>
            <span class="timeline-dot"></span>
            <p>
              <strong>Demo workspace is ready</strong><small
                >Create or update a record to see your team’s activity here.</small
              >
            </p>
          </div>
          <div>
            <span class="timeline-dot lilac"></span>
            <p>
              <strong>Welcome to Common Ground</strong><small
                >A shared place for the work that matters.</small
              >
            </p>
          </div>{/each}
      </div>
    </section>
  </div>
  <div>
    <section class="welcome-card">
      <span class="decorative" aria-hidden="true">✳</span>
      <p>BETTER, TOGETHER</p>
      <h2>A place for everyone.<br />A little help from you.</h2>
      <p>Bring people, services and support<br />closer together.</p>
      {#if allowed.includes('Members')}<button
          onclick={() => {
            onCreate('Members');
          }}>Add a community member <span>↗</span></button
        >{:else}<button onclick={() => onNavigate('Reports')}
          >Explore community reports ↗</button
        >{/if}
    </section>
    {#if allowed.includes('Events')}<section class="panel">
        <div class="panel-heading">
          <h2>Coming up</h2>
          <button class="text-button" onclick={() => onNavigate('Events')}
            >View all →</button
          >
        </div>
        {#each records.Events.filter((r) => r.date >= today()).slice(0, 3) as r (r.id)}<button
            class="event-row"
            onclick={() => {
              onShowRecord(r);
            }}
            ><span class="calendar-date"
              ><small>{month(r.date)}</small>{r.date.slice(8)}</span
            >
            <div>
              <strong>{r.name}</strong><small>{r.location}</small><span
                >{r.attendees || 0} attending</span
              >
            </div></button
          >{:else}<div class="empty">
            No upcoming events.<button
              onclick={() => {
                onCreate('Events');
              }}>Create event</button
            >
          </div>{/each}
      </section>{/if}
    <div class="help-note">
      <span>✧</span>
      <p>
        <strong>Good work starts with connection.</strong><br />Your community
        is in good hands.
      </p>
    </div>
  </div>
</div>
