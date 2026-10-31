import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialRecords } from '../../src/lib/data.ts';
import type { WorkspaceSnapshot } from '../../src/lib/model.ts';
import { emptyForm, object, validateForm } from '../../src/lib/records.ts';
import {
  decodeSnapshot,
  draftKey,
  loadDraft,
  loadWorkspace,
  saveDraft,
  saveWorkspace,
  workspaceKey,
  type StorageAccess
} from '../../src/lib/persistence.ts';

function memoryStorage(): StorageAccess {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    }
  };
}
function snapshot(): WorkspaceSnapshot {
  return {
    records: structuredClone(initialRecords),
    dark: true,
    savedViews: [
      {
        name: 'Active members',
        module: 'Members',
        query: '',
        status: 'Active',
        sort: 'name'
      }
    ],
    audit: [
      {
        action: 'Updated',
        record: 'Amelia Thompson',
        by: 'Sarah Mitchell',
        at: '2026-10-31T01:00:00Z'
      }
    ]
  };
}

test('empty storage and valid versioned workspaces load predictably', () => {
  const storage = memoryStorage();
  assert.equal(loadWorkspace(storage).status, 'empty');
  saveWorkspace(storage, snapshot());
  const result = loadWorkspace(storage);
  assert.equal(result.status, 'loaded');
  if (result.status !== 'loaded') throw new Error('Expected loaded snapshot');
  assert.equal(result.snapshot.dark, true);
  assert.equal(result.snapshot.records.Donations[0]?.amount, 150);
  assert.equal(result.snapshot.savedViews[0]?.name, 'Active members');
  assert.equal(object(JSON.parse(storage.getItem(workspaceKey)!)).version, 2);
});

test('valid legacy workspaces migrate kinds and missing counters without losing IDs or notes', () => {
  const legacy = snapshot();
  for (const records of Object.values(legacy.records)) {
    for (const record of records) Reflect.deleteProperty(record, 'kind');
  }
  Reflect.deleteProperty(legacy.records.Programs[0]!, 'capacity');
  Reflect.deleteProperty(legacy.records.Programs[0]!, 'participants');
  Reflect.deleteProperty(legacy.records.Events[0]!, 'attendees');
  const decoded = decodeSnapshot(legacy);
  assert.equal(decoded.records.Members[0]?.kind, 'Members');
  assert.equal(decoded.records.Members[0]?.id, 'M-1001');
  assert.equal(decoded.records.Members[0]?.notes, 'Prefers contact by email.');
  assert.equal(decoded.records.Programs[0]?.capacity, 0);
  assert.equal(decoded.records.Events[0]?.attendees, 0);
  const storage = memoryStorage();
  saveWorkspace(storage, decoded);
  assert.equal(loadWorkspace(storage).status, 'loaded');
});

test('malformed JSON and invalid root values are rejected without overwriting storage', () => {
  for (const value of ['{broken', '', 'null', '[]', '42', '"text"']) {
    const storage = memoryStorage();
    storage.setItem(workspaceKey, value);
    assert.equal(loadWorkspace(storage).status, 'invalid');
    assert.equal(storage.getItem(workspaceKey), value);
  }
});

test('invalid nested records, metadata and future versions reject the entire snapshot', () => {
  const variants: ((value: Record<string, unknown>) => void)[] = [
    (value) => {
      value.records = {};
    },
    (value) => {
      value.savedViews = [
        {
          name: 'Broken',
          module: 'Unknown',
          query: '',
          status: 'Active',
          sort: 'name'
        }
      ];
    },
    (value) => {
      value.savedViews = [
        {
          name: 'Broken',
          module: 'Members',
          query: '',
          status: 'Active',
          sort: 'unknown'
        }
      ];
    },
    (value) => {
      value.audit = [
        { action: 'Updated', record: 'Member', by: 'User', at: 'invalid' }
      ];
    },
    (value) => {
      value.dark = 'true';
    },
    (value) => {
      value.version = 99;
    },
    (value) => {
      const records = object(value.records);
      records.Members = [{ ...initialRecords.Members[0], name: 42 }];
    },
    (value) => {
      const records = object(value.records);
      records.Members = [initialRecords.Members[0], initialRecords.Members[0]];
    }
  ];
  for (const mutate of variants) {
    const value: Record<string, unknown> = { ...snapshot(), version: 2 };
    mutate(value);
    assert.throws(() => decodeSnapshot(value));
  }
});

test('storage access and quota failures are surfaced', () => {
  const storage: StorageAccess = {
    getItem() {
      throw new Error('denied');
    },
    setItem() {
      throw new Error('quota');
    }
  };
  assert.equal(loadWorkspace(storage).status, 'unavailable');
  assert.throws(() => saveWorkspace(storage, snapshot()), /quota/);
  assert.throws(
    () => saveDraft(storage, 'Members', emptyForm('Members', '')),
    /quota/
  );
});

test('drafts preserve unfinished entries, stay isolated by module and support legacy data', () => {
  const storage = memoryStorage();
  const form = {
    ...emptyForm('Members', ''),
    name: 'Unfinished member',
    email: 'unfinished@'
  };
  saveDraft(storage, 'Members', form);
  assert.deepEqual(loadDraft(storage, 'Members'), form);
  assert.ok(validateForm('Members', loadDraft(storage, 'Members')!).email);
  assert.equal(loadDraft(storage, 'Donations'), null);
  storage.setItem(draftKey('Members'), JSON.stringify(form));
  assert.deepEqual(loadDraft(storage, 'Members'), form);
});

test('malformed drafts, incompatible envelopes and wrong field types cannot enter a form', () => {
  const form = emptyForm('Members', '2026-10-31');
  const variants = [
    null,
    [],
    { ...form, name: 7 },
    { ...form, notes: {} },
    { ...form, date: '2026-02-30' },
    { ...form, status: 'Unknown' },
    { ...form, amount: 'nope' },
    { version: 99, module: 'Members', form },
    { version: 2, module: 'Cases', form }
  ];
  const storage = memoryStorage();
  for (const invalid of variants) {
    const raw = JSON.stringify(invalid);
    storage.setItem(draftKey('Members'), raw);
    assert.throws(() => loadDraft(storage, 'Members'));
    assert.equal(storage.getItem(draftKey('Members')), raw);
  }
});

test('legacy defaults apply to absent fields, never null or malformed values', () => {
  for (const field of ['capacity', 'participants']) {
    const saved = snapshot();
    Reflect.set(saved.records.Programs[0]!, field, null);
    assert.throws(() => decodeSnapshot(saved));
  }
  assert.throws(() => decodeSnapshot({ ...snapshot(), audit: null }));
  assert.throws(() => decodeSnapshot({ ...snapshot(), savedViews: null }));
});

test('blank numeric drafts stay blank instead of becoming zero on restoration', () => {
  const storage = memoryStorage();
  const form = {
    ...emptyForm('Programs', ''),
    capacity: undefined,
    participants: undefined
  };
  saveDraft(storage, 'Programs', form);
  const restored = loadDraft(storage, 'Programs')!;
  assert.equal(restored.capacity, '');
  assert.equal(restored.participants, '');
  assert.ok(validateForm('Programs', restored).capacity);
});
