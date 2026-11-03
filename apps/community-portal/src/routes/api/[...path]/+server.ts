import { error, isHttpError, type RequestEvent } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  apiError,
  checked,
  jsonBody,
  reply,
  requireUser,
  stringValue,
  uuid
} from '#lib/server/api.ts';
import {
  currentOrganisation,
  selectOrganisation
} from '#lib/server/workspace.ts';
import {
  fromRow,
  deidentifiedRow,
  insertRecord,
  isDataModule,
  tables,
  toRow,
  type DataModule
} from '#lib/server/records.ts';
import {
  buildRecord,
  decodeDraft,
  decodeRecord,
  decodeViews,
  recordForm,
  validateForm
} from '#lib/records.ts';
import { roles, type Role } from '#lib/model.ts';
import { initialRecords } from '#lib/data.ts';
import type { Json } from '#lib/backend/database.types.ts';
import { isDate } from '#lib/records.ts';

function roleValue(value: unknown): Role {
  if (!roles.some((role) => role === value))
    apiError(400, 'invalid', 'Choose a valid role.');
  return value as Role;
}
async function access(event: RequestEvent, module: DataModule, write = true) {
  const context = await currentOrganisation(event);
  const permission = checked(
    await context.client
      .from('role_permissions')
      .select('can_write')
      .eq('role', context.membership.role)
      .eq('module', module)
      .maybeSingle()
  );
  if (!permission || (write && !permission.can_write))
    apiError(403, 'forbidden', 'You do not have access to this module.');
  return context;
}
function recordInput(
  module: DataModule,
  body: Record<string, unknown>,
  id: string,
  updating: boolean
) {
  try {
    const form = updating
      ? recordForm(decodeRecord(module, body.record))
      : decodeDraft(module, body.form);
    const fieldErrors = validateForm(module, form);
    if (module === 'Cases' && !form.memberId)
      fieldErrors.memberId = 'Choose a related member.';
    if (Object.keys(fieldErrors).length)
      error(400, 'Check the highlighted fields.', {
        code: 'invalid',
        fieldErrors
      });
    return buildRecord(module, form, id, new Date().toISOString(), '');
  } catch (caught) {
    if (isHttpError(caught)) throw caught;
    apiError(400, 'invalid', 'Check the entered record values.');
  }
}
async function handle(event: RequestEvent) {
  const { client, user } = requireUser(event.locals);
  const parts = event.url.pathname
    .slice('/api/'.length)
    .split('/')
    .map(decodeURIComponent);
  const method = event.request.method;
  const body = method === 'GET' ? {} : await jsonBody(event);
  if (parts[0] === 'records' && isDataModule(parts[1] ?? '')) {
    const module = parts[1] as DataModule;
    const { org } = await access(event, module);
    const table = tables[module];
    if (method === 'POST' && parts.length === 2) {
      const record = recordInput(module, body, module[0] + '-new', false);
      const row = checked<Record<string, unknown> | null>(
        await insertRecord(client, record, org)
      );
      if (!row) apiError(503, 'offline', 'The record could not be created.');
      return reply(fromRow(module, row, user.email ?? 'Account holder'));
    }
    if (method === 'PATCH' && parts.length === 3) {
      const id = stringValue(parts[2], 64);
      const expected = stringValue(body.expectedUpdatedAt, 50);
      if (!Number.isFinite(Date.parse(expected)))
        apiError(400, 'invalid', 'Reload the record before editing it.');
      const record = recordInput(module, body, id, true);
      const row = checked(
        await client
          .from(table)
          .update(toRow(record, org))
          .eq('org_id', org)
          .eq('id', id)
          .eq('updated_at', expected)
          .select()
          .maybeSingle()
      );
      if (!row)
        apiError(
          409,
          'conflict',
          'This record changed or is no longer available. Reload before saving.'
        );
      return reply(fromRow(module, row, user.email ?? 'Account holder'));
    }
    if (method === 'POST' && parts[2] === 'archive' && parts.length === 3) {
      const ids = body.ids;
      if (
        !Array.isArray(ids) ||
        !ids.length ||
        ids.length > 200 ||
        !ids.every((id) => typeof id === 'string' && id.length <= 64) ||
        new Set(ids).size !== ids.length
      )
        apiError(400, 'invalid', 'Choose between 1 and 200 records.');
      const rows =
        checked(
          await client
            .from(table)
            .update({ status: 'Archived' })
            .eq('org_id', org)
            .in('id', ids)
            .select()
        ) ?? [];
      return reply(
        rows.map((row) => fromRow(module, row, user.email ?? 'Account holder'))
      );
    }
  }
  if (
    parts[0] === 'reports' &&
    parts.length === 2 &&
    isDataModule(parts[1]) &&
    method === 'GET'
  ) {
    const { org } = await currentOrganisation(event);
    const from = event.url.searchParams.get('from') ?? '';
    const to = event.url.searchParams.get('to') ?? '';
    if (
      (from && !isDate(from)) ||
      (to && !isDate(to)) ||
      (from && to && from > to)
    )
      apiError(400, 'invalid', 'Choose a valid date range.');
    const data = checked(
      await client.rpc('report_rows', {
        p_org: org,
        p_module: parts[1],
        ...(from ? { p_from: from } : {}),
        ...(to ? { p_to: to } : {})
      })
    );
    const readable = checked(
      await client
        .from('role_permissions')
        .select('module')
        .eq('role', (await currentOrganisation(event)).membership.role)
        .eq('module', parts[1])
        .maybeSingle()
    );
    // Full report rows use the same strict decoder as workspace records.
    // Otherwise preserve the RPC's de-identified shape, without PII keys.
    if (readable && Array.isArray(data))
      return reply(
        data.map((row) =>
          fromRow(parts[1] as DataModule, row as Record<string, unknown>)
        )
      );
    return reply(
      Array.isArray(data)
        ? data.map((row) =>
            deidentifiedRow(
              parts[1] as DataModule,
              row as Record<string, unknown>
            )
          )
        : []
    );
  }
  if (parts.join('/') === 'workspace/org' && method === 'POST') {
    const org = uuid(body.orgId);
    const membership = checked(
      await client
        .from('memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .eq('org_id', org)
        .eq('status', 'Active')
        .maybeSingle()
    );
    if (!membership)
      apiError(
        403,
        'forbidden',
        'You do not have access to this organisation.'
      );
    selectOrganisation(event, org);
    return reply({ ok: true });
  }
  if (parts.join('/') === 'account' && method === 'DELETE') {
    checked(await client.rpc('delete_my_account'));
    try {
      await client.auth.signOut({ scope: 'local' });
    } catch {
      /* Clear the deleted account's browser session regardless. */
    }
    for (const { name } of event.cookies.getAll())
      if (name.startsWith('sb-') || name.startsWith('portal-'))
        event.cookies.delete(name, { path: '/' });
    return reply({ ok: true });
  }
  const { org } = await currentOrganisation(event);
  if (parts.join('/') === 'workspace/reset' && method === 'POST') {
    checked(
      await client.rpc('seed_demo_workspace', {
        p_org: org,
        p_payload: initialRecords as unknown as Json
      })
    );
    return reply({ ok: true });
  }
  if (parts.join('/') === 'role' && method === 'POST') {
    checked(
      await client.rpc('set_my_demo_role', {
        p_org: org,
        p_role: roleValue(body.role)
      })
    );
    return reply({ ok: true });
  }
  if (parts.join('/') === 'views' && method === 'POST') {
    let view;
    try {
      view = decodeViews([body])[0];
    } catch {
      apiError(400, 'invalid', 'Check the saved view values.');
    }
    checked(
      await client
        .from('saved_views')
        .insert({ ...view, org_id: org, user_id: user.id })
    );
    return reply(view);
  }
  if (parts.join('/') === 'invitations' && method === 'POST') {
    const email = stringValue(body.email, 254).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      apiError(400, 'invalid', 'Enter a valid email address.');
    const token = checked(
      await client.rpc('create_invitation', {
        p_org: org,
        p_email: email,
        p_role: roleValue(body.role)
      })
    );
    return reply({ link: event.url.origin + '/invite/' + token });
  }
  if (parts[0] === 'members' && parts.length === 2 && method === 'PATCH') {
    const target = uuid(parts[1]);
    if (body.deactivate === true)
      checked(
        await client.rpc('deactivate_member', { p_org: org, p_user: target })
      );
    else
      checked(
        await client.rpc('set_member_role', {
          p_org: org,
          p_user: target,
          p_role: roleValue(body.role)
        })
      );
    return reply({ ok: true });
  }
  apiError(404, 'invalid', 'This endpoint does not exist.');
}
export const GET: RequestHandler = handle;
export const POST: RequestHandler = handle;
export const PATCH: RequestHandler = handle;
export const DELETE: RequestHandler = handle;
