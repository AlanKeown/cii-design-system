import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fromRow,
  toRow,
  deidentifiedRow
} from '../../src/lib/server/records.ts';
import { databaseError } from '../../src/lib/server/database-error.ts';
import { createLiveBackend } from '../../src/lib/backend/live.ts';
import { buildRecord, emptyForm } from '../../src/lib/records.ts';
import { PortalBackendError } from '../../src/lib/backend/types.ts';

test('database rows are decoded and only editable columns are written', () => {
  const row = {
    org_id: 'private-org',
    id: 'M-test',
    name: 'Fictional person',
    status: 'Active',
    date: '2026-11-03',
    type: 'Member',
    location: 'Sydney',
    email: 'fictional@example.test',
    program_id: 'P-test',
    notes: null,
    phone: null,
    tags: null,
    updated_at: '2026-11-03T00:00:00Z',
    updated_by: 'actor-id'
  };
  const record = fromRow('Members', row);
  assert.equal(record.kind, 'Members');
  assert.equal(record.updatedAt, row.updated_at);
  assert.ok(record.kind === 'Members');
  assert.equal(record.programId, 'P-test');
  assert.equal(record.notes, undefined);
  assert.equal(Reflect.has(record, 'org_id'), false);
  const written = toRow(record, 'chosen-org');
  assert.equal(written.org_id, 'chosen-org');
  assert.equal(Reflect.get(written, 'program_id'), 'P-test');
  assert.equal(Reflect.has(written, 'updated_by'), false);
  assert.equal(Reflect.has(written, 'updated_at'), false);
  assert.throws(() => fromRow('Members', { ...row, status: 'Unknown' }));
  assert.throws(() =>
    fromRow('Programs', { ...row, capacity: 1, participants: 2 })
  );
});
test('database errors map to stable, non-sensitive backend errors', () => {
  for (const [code, status, expected] of [
    ['42501', 403, 'forbidden'],
    ['23505', 409, 'conflict'],
    ['23514', 400, 'invalid'],
    ['22023', 400, 'invalid'],
    ['unknown', 503, 'offline']
  ] as const) {
    const mapped = databaseError({ code, message: 'Private database detail' });
    assert.equal(mapped.status, status);
    assert.equal(mapped.error.code, expected);
    assert.ok(!mapped.error.message.includes('Private database detail'));
  }
  assert.equal(
    databaseError({ code: 'P0001', message: 'ORG_ROW_LIMIT' }).error.code,
    'limit'
  );
});
test('live backend preserves optimistic timestamps and binds mutations to the visible organisation', async () => {
  const record = buildRecord(
    'Members',
    { ...emptyForm('Members', '2026-11-03'), name: 'Fictional person' },
    'M-test',
    '2026-11-03T00:00:00Z',
    'actor'
  );
  let sent: { url?: string; init?: RequestInit } = {};
  const backend = createLiveBackend('chosen-org', async (url, init) => {
    sent = { url: String(url), init };
    return Response.json(record);
  });
  assert.deepEqual(
    await backend.updateRecord(record, record.updatedAt),
    record
  );
  assert.equal(sent.url, '/api/records/Members/M-test');
  assert.equal(sent.init?.method, 'PATCH');
  assert.equal(
    new Headers(sent.init?.headers).get('x-portal-org'),
    'chosen-org'
  );
  assert.equal(
    JSON.parse(String(sent.init?.body)).expectedUpdatedAt,
    record.updatedAt
  );
});
test('live errors preserve conflicts and field errors; expired sessions trigger sign-in', async () => {
  const backend = createLiveBackend('org', async () =>
    Response.json(
      {
        code: 'conflict',
        message: 'Reload first.',
        fieldErrors: { name: 'Changed' }
      },
      { status: 409 }
    )
  );
  await assert.rejects(
    () => backend.resetDemoData(),
    (error: unknown) =>
      error instanceof PortalBackendError &&
      error.code === 'conflict' &&
      error.fieldErrors?.name === 'Changed'
  );
  let redirected = false;
  const expired = createLiveBackend(
    'org',
    async () => Response.json({ message: 'Sign in.' }, { status: 401 }),
    () => {
      redirected = true;
    }
  );
  await assert.rejects(() => expired.resetDemoData(), PortalBackendError);
  assert.equal(redirected, true);
  const offline = createLiveBackend('org', async () => {
    throw new Error('Network');
  });
  await assert.rejects(
    () => offline.resetDemoData(),
    (error: unknown) =>
      error instanceof PortalBackendError && error.code === 'offline'
  );
});

test('report boundary strips identifying fields even from an unexpectedly full RPC row', () => {
  assert.deepEqual(
    deidentifiedRow('Members', {
      id: 'M-test',
      status: 'Active',
      type: 'Member',
      location: 'Sydney',
      date: '2026-11-03',
      name: 'Private name',
      email: 'private@example.test',
      notes: 'Private note',
      org_id: 'private',
      updated_by: 'private'
    }),
    {
      kind: 'Members',
      id: 'M-test',
      status: 'Active',
      type: 'Member',
      location: 'Sydney',
      date: '2026-11-03'
    }
  );
});
