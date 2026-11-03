<script lang="ts">
  import { tick } from 'svelte';
  import { Alert, Button, TextField } from '@cii/svelte';
  import { roles, type Role } from '../model.ts';
  import { backendError } from '../backend/types.ts';
  import type { Database } from '../backend/database.types.ts';
  let {
    users,
    request,
    onRefresh
  }: {
    users: Database['public']['Functions']['list_org_users']['Returns'];
    request: <T>(path: string, method?: string, body?: unknown) => Promise<T>;
    onRefresh: () => Promise<void>;
  } = $props();
  let email = $state(''),
    role = $state<Role>('Staff'),
    link = $state(''),
    failure = $state(''),
    pending = $state(false);
  async function run(operation: () => Promise<void>) {
    if (pending) return;
    pending = true;
    failure = '';
    try {
      await operation();
    } catch (error) {
      failure = backendError(error).message;
      await tick();
      document.getElementById('admin-error')?.focus();
    } finally {
      pending = false;
    }
  }
</script>

<section class="panel" aria-label="Manage organisation users">
  <h2>Invite a user</h2>
  <p>
    Use fictional test accounts. Copy the link and share it with the intended
    recipient; no invitation email is sent.
  </p>
  {#if failure}<div id="admin-error" tabindex="-1">
      <Alert tone="danger" role="alert">{failure}</Alert>
    </div>{/if}
  <form
    onsubmit={(e) => {
      e.preventDefault();
      void run(async () => {
        const result = await request<{ link: string }>('invitations', 'POST', {
          email,
          role
        });
        link = result.link;
      });
    }}
  >
    <TextField
      id="invite-email"
      label="Invitation email"
      type="email"
      autocomplete="email"
      bind:value={email}
      required
      maxlength={254}
    />
    <label
      >Invitation role<select bind:value={role}
        >{#each roles as item (item)}<option>{item}</option>{/each}</select
      ></label
    >
    <Button type="submit" disabled={pending}>Create invitation link</Button>
  </form>
  {#if link}<label
      >Invitation link<input
        readonly
        value={link}
        onclick={(e) => e.currentTarget.select()}
      /></label
    >
    <p role="status">Invitation created. Copy the link above.</p>{/if}
  <h2>Team access</h2>
  {#each users.filter((user) => !!user.user_id) as user (user.user_id)}
    <div class="team-user">
      <span>{user.email}{user.is_owner ? ' (owner)' : ''} · {user.status}</span>
      {#if !user.is_owner}
        <label
          >Role for {user.email}<select
            value={user.role}
            disabled={pending}
            onchange={(e) => {
              const role = e.currentTarget.value;
              void run(async () => {
                await request('members/' + user.user_id, 'PATCH', { role });
                await onRefresh();
              });
            }}
            >{#each roles as item (item)}<option>{item}</option>{/each}</select
          ></label
        >
        <Button
          disabled={pending || user.status !== 'Active'}
          onclick={() => {
            if (confirm('Deactivate this organisation membership?'))
              void run(async () => {
                await request('members/' + user.user_id, 'PATCH', {
                  deactivate: true
                });
                await onRefresh();
              });
          }}>Deactivate {user.email}</Button
        >
      {/if}
    </div>
  {/each}
</section>

<style>
  form,
  .team-user {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 1rem;
    margin: 1rem 0;
  }
  label {
    display: grid;
    gap: 0.5rem;
  }
  input {
    min-width: 16rem;
    max-width: 100%;
  }
</style>
