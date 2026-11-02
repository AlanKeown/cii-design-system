import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLocalBackend } from '../../src/lib/backend/local.ts';
import { PortalBackendError } from '../../src/lib/backend/types.ts';
import { initialRecords } from '../../src/lib/data.ts';
import { recordModules } from '../../src/lib/model.ts';
import { emptyForm } from '../../src/lib/records.ts';
import {
  draftKey,
  workspaceKey,
  type StorageAccess
} from '../../src/lib/persistence.ts';

function fixture(raw?: string) {
  const values = new Map<string, string>(
    raw === undefined ? [] : [[workspaceKey, raw]]
  );
  let failWrites = false;
  let counter = 0;
  const storage: StorageAccess = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      if (failWrites) throw new Error('Quota exceeded');
      values.set(key, value);
    }
  };
  const options = {
    storage: () => storage,
    actor: 'Test actor',
    now: () => `2026-11-03T00:00:${String(++counter).padStart(2, '0')}.000Z`,
    uuid: () => String(++counter)
  };
  return {
    backend: createLocalBackend(options),
    values,
    options,
    failWrites: (fail: boolean) => {
      failWrites = fail;
    }
  };
}
const form = () => ({
  ...emptyForm('Members', '2026-11-03'),
  name: 'Test member'
});

test('local operations persist every record kind with adapter-owned identity and audit', async () => {
  const { backend, options } = fixture();
  for (const module of recordModules) {
    const created = await backend.createRecord(module, {
      ...emptyForm(module, '2026-11-03'),
      name: module,
      amount: 12
    });
    assert.match(created.id, new RegExp('^' + module[0] + '-'));
    assert.equal(created.updatedBy, 'Test actor');
    const updated = await backend.updateRecord(
      { ...created, notes: 'A note', updatedBy: 'Forged' },
      created.updatedAt,
      'Added note'
    );
    assert.equal(updated.updatedBy, 'Test actor');
    const archived = await backend.archiveRecords(module, [
      updated.id,
      updated.id
    ]);
    assert.equal(archived.length, 1);
    assert.equal(archived[0]?.status, 'Archived');
  }
  const snapshot = backend.readSnapshot();
  assert.equal(snapshot.audit.length, recordModules.length * 3);
  assert.equal(snapshot.audit[1]?.action, 'Added note');
  assert.deepEqual(
    JSON.parse(JSON.stringify(createLocalBackend(options).readSnapshot())),
    JSON.parse(JSON.stringify(snapshot))
  );
});

test('concurrent calls preserve each write and exposed records cannot mutate the workspace', async () => {
  const { backend } = fixture();
  const [first, second] = await Promise.all([
    backend.createRecord('Members', form()),
    backend.createRecord('Members', form())
  ]);
  assert.notEqual(first.id, second.id);
  first.name = 'External mutation';
  const snapshot = backend.readSnapshot();
  snapshot.records.Members.length = 0;
  assert.equal(
    backend.readSnapshot().records.Members.length,
    initialRecords.Members.length + 2
  );
  assert.equal(
    backend.readSnapshot().records.Members.find((r) => r.id === first.id)?.name,
    'Test member'
  );
});

test('invalid forms, missing IDs and stale updates reject without changing the workspace', async () => {
  const { backend } = fixture();
  const before = backend.readSnapshot();
  await assert.rejects(
    backend.createRecord('Members', { ...form(), name: '' }),
    (error: unknown) =>
      error instanceof PortalBackendError &&
      error.code === 'invalid' &&
      !!error.fieldErrors?.name
  );
  await assert.rejects(
    backend.archiveRecords('Members', [
      initialRecords.Members[0]!.id,
      'missing'
    ]),
    PortalBackendError
  );
  assert.deepEqual(backend.readSnapshot(), before);
  const created = await backend.createRecord('Members', form());
  await backend.updateRecord(
    { ...created, name: 'Updated' },
    created.updatedAt
  );
  const saved = backend.readSnapshot();
  await assert.rejects(
    backend.updateRecord(created, created.updatedAt),
    (error: unknown) =>
      error instanceof PortalBackendError && error.code === 'conflict'
  );
  await assert.rejects(
    backend.updateRecord({ ...created, id: 'missing' }),
    PortalBackendError
  );
  assert.deepEqual(backend.readSnapshot(), saved);
});

test('saved views, theme and report date boundaries survive persistence', async () => {
  const { backend, options } = fixture();
  const view = {
    name: 'Active',
    module: 'Members',
    query: 'Test',
    status: 'Active',
    sort: 'name'
  } as const;
  const saved = await backend.saveView(view);
  saved.name = 'External';
  backend.setDark(true);
  assert.deepEqual(createLocalBackend(options).readSnapshot().savedViews, [
    view
  ]);
  assert.equal(createLocalBackend(options).readSnapshot().dark, true);
  assert.equal(
    (await backend.reportRows('Members', '2026-10-20', '2026-10-22')).length,
    3
  );
  assert.equal(
    (await backend.reportRows('Members', '2026-10-22', '2026-10-20')).length,
    0
  );
  const rows = await backend.reportRows('Members', '', '');
  rows[0]!.name = 'External';
  assert.notEqual(backend.readSnapshot().records.Members[0]?.name, 'External');
});

test('legacy workspaces upgrade on initialization without losing activity, views or theme', () => {
  const legacy = {
    records: structuredClone(initialRecords),
    dark: true,
    savedViews: [],
    audit: [
      {
        action: 'Imported',
        record: 'Legacy',
        by: 'Demo',
        at: '2026-10-31T00:00:00Z'
      }
    ]
  };
  for (const list of Object.values(legacy.records))
    for (const record of list) Reflect.deleteProperty(record, 'kind');
  const { backend, values } = fixture(JSON.stringify(legacy));
  assert.equal(backend.readSnapshot().dark, true);
  assert.equal(backend.readSnapshot().audit[0]?.action, 'Imported');
  assert.match(values.get(workspaceKey)!, /"version":2/);
  assert.equal(backend.readSnapshot().records.Members[0]?.kind, 'Members');
});

test('corrupt storage remains byte-for-byte intact until explicit replacement', async () => {
  const { backend, values } = fixture('{corrupt');
  backend.setDark(true);
  const created = await backend.createRecord('Members', form());
  assert.equal(values.get(workspaceKey), '{corrupt');
  assert.equal(backend.persistenceStatus().recoveryNeeded, true);
  backend.replaceSavedWorkspace();
  assert.equal(backend.persistenceStatus().saved, true);
  assert.equal(backend.persistenceStatus().recoveryNeeded, false);
  assert.ok(values.get(workspaceKey)?.includes(created.id));
});

test('unavailable storage and quota failures preserve in-memory work and report unsaved status', async () => {
  for (const storage of [
    () => {
      throw new Error('Denied');
    },
    () => ({
      getItem() {
        throw new Error('Denied');
      },
      setItem() {
        throw new Error('Denied');
      }
    })
  ]) {
    const backend = createLocalBackend({ storage });
    const created = await backend.createRecord('Members', form());
    assert.ok(
      backend.readSnapshot().records.Members.some((r) => r.id === created.id)
    );
    assert.equal(backend.persistenceStatus().saved, false);
    assert.match(backend.persistenceStatus().message, /unavailable/);
  }
  const { backend, values, failWrites } = fixture();
  const original = values.get(workspaceKey);
  failWrites(true);
  await backend.createRecord('Members', form());
  assert.equal(values.get(workspaceKey), original);
  assert.equal(backend.persistenceStatus().saved, false);
  assert.match(backend.persistenceStatus().message, /could not be saved/);
  failWrites(false);
  backend.setDark(true);
  assert.equal(backend.persistenceStatus().saved, true);
  assert.equal(
    backend.readSnapshot().records.Members.length,
    initialRecords.Members.length + 1
  );
});

test('failed corrupt-data replacement remains recoverable and reset preserves theme and drafts', async () => {
  const { backend, values, failWrites } = fixture('{corrupt');
  failWrites(true);
  backend.replaceSavedWorkspace();
  assert.equal(values.get(workspaceKey), '{corrupt');
  assert.equal(backend.persistenceStatus().recoveryNeeded, true);
  failWrites(false);
  backend.replaceSavedWorkspace();
  const key = draftKey('Members');
  values.set(key, 'unfinished draft');
  backend.setDark(true);
  await backend.createRecord('Members', form());
  await backend.saveView({
    name: 'View',
    module: 'Members',
    query: '',
    status: 'All statuses',
    sort: 'name'
  });
  await backend.resetDemoData();
  assert.deepEqual(backend.readSnapshot(), {
    records: initialRecords,
    audit: [],
    savedViews: [],
    dark: true
  });
  assert.equal(values.get(key), 'unfinished draft');
});
