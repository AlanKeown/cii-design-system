import type { RequestEvent } from '@sveltejs/kit';
import type { Json } from '../backend/database.types.ts';
import { roles, type Module, type Role } from '../model.ts';
import type { SessionInfo, Workspace } from '../backend/types.ts';
import { initialRecords } from '../data.ts';
import {
  decodeAudit,
  decodeRecord,
  decodeViews,
  putRecord
} from '../records.ts';
import { checked, requireUser, apiError } from './api.ts';
import { emptyRecords, fromRow, tables, type DataModule } from './records.ts';
import { sessionCookiePolicy } from './cookie-policy.ts';

export function selectOrganisation(event: RequestEvent, org: string) {
  event.cookies.set('portal-org', org, {
    ...sessionCookiePolicy(event.url),
    maxAge: 60 * 60 * 24 * 30
  });
}
export async function currentOrganisation(event: RequestEvent) {
  const { client, user } = requireUser(event.locals);
  const org = event.cookies.get('portal-org');
  const requestedOrg = event.request.headers.get('x-portal-org');
  if (requestedOrg && requestedOrg !== org)
    apiError(
      409,
      'conflict',
      'The organisation changed in another tab. Reload before saving.'
    );
  if (!org)
    apiError(409, 'session', 'Open your workspace before making changes.');
  const membership = checked(
    await client
      .from('memberships')
      .select('role,is_owner')
      .eq('org_id', org)
      .eq('user_id', user.id)
      .eq('status', 'Active')
      .maybeSingle()
  );
  if (!membership)
    apiError(
      403,
      'forbidden',
      'You no longer have access to this organisation.'
    );
  return { client, user, org, membership };
}
export async function loadWorkspace(
  event: RequestEvent
): Promise<{ workspace: Workspace; session: SessionInfo }> {
  const { client, user } = requireUser(event.locals);
  const preferred = event.cookies.get('portal-org');
  const boot = checked(
    await client.rpc('bootstrap_demo_workspace', {
      p_payload: initialRecords as unknown as Json,
      ...(preferred && /^[0-9a-f-]{36}$/i.test(preferred)
        ? { p_preferred_org: preferred }
        : {})
    })
  )?.[0];
  if (!boot) apiError(503, 'offline', 'Your workspace could not be opened.');
  const org = boot.org_id;
  selectOrganisation(event, org);
  const [
    profileResult,
    membershipsResult,
    organisationsResult,
    permissionsResult
  ] = await Promise.all([
    client.from('profiles').select('id,display_name'),
    client
      .from('memberships')
      .select('org_id,role,is_owner')
      .eq('user_id', user.id)
      .eq('status', 'Active'),
    client.from('organisations').select('id,name'),
    client.from('role_permissions').select('*')
  ]);
  const profiles = checked(profileResult) ?? [];
  const profile = profiles.find((profile) => profile.id === user.id);
  const memberships = checked(membershipsResult) ?? [];
  const organisations = checked(organisationsResult) ?? [];
  const matrix = checked(permissionsResult) ?? [];
  const membership = memberships.find((m) => m.org_id === org);
  if (!membership)
    apiError(403, 'forbidden', 'Your membership is no longer active.');
  const permissions = Object.fromEntries(
    roles.map((role) => [
      role,
      matrix.filter((p) => p.role === role).map((p) => p.module)
    ])
  ) as Record<Role, Module[]>;
  const records = emptyRecords();
  await Promise.all(
    (Object.keys(tables) as DataModule[])
      .filter((module) => permissions[membership.role].includes(module))
      .map(async (module) => {
        for (const row of checked(
          await client
            .from(tables[module])
            .select('*')
            .eq('org_id', org)
            .order('date', { ascending: false })
        ) ?? [])
          putRecord(
            records,
            fromRow(
              module,
              row,
              profiles.find((profile) => profile.id === row.updated_by)
                ?.display_name
            )
          );
      })
  );
  const [viewsResult, auditResult, usersResult] = await Promise.all([
    client
      .from('saved_views')
      .select('*')
      .eq('org_id', org)
      .eq('user_id', user.id),
    membership.role === 'Admin'
      ? client
          .from('audit_log')
          .select('*')
          .eq('org_id', org)
          .order('at', { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [], error: null }),
    membership.role === 'Admin'
      ? client.rpc('list_org_users', { p_org: org })
      : Promise.resolve({ data: [], error: null })
  ]);
  const users = checked(usersResult) ?? [];
  for (const row of users)
    putRecord(
      records,
      decodeRecord('Administration', {
        kind: 'Administration',
        id: row.id,
        name: row.name,
        email: row.email,
        type: row.role,
        status: row.status,
        date: row.date,
        location: ''
      })
    );
  return {
    session: {
      displayName: profile?.display_name ?? user.email ?? 'Demo user',
      orgId: org,
      role: membership.role,
      isOwner: membership.is_owner,
      orgs: memberships.map((m) => ({
        id: m.org_id,
        name:
          organisations.find((o) => o.id === m.org_id)?.name ??
          'Demo organisation',
        role: m.role,
        isOwner: m.is_owner
      }))
    },
    workspace: {
      records,
      permissions,
      savedViews: decodeViews(checked(viewsResult) ?? []).filter((view) =>
        permissions[membership.role].includes(view.module)
      ),
      audit: decodeAudit(
        (checked(auditResult) ?? []).map((a) => ({
          action: a.action,
          record: a.record_name,
          by: a.actor_name,
          at: a.at
        }))
      ),
      users
    }
  };
}
