import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialRecords } from '../../src/lib/data.ts';
import { recordModules } from '../../src/lib/model.ts';
import {
  buildRecord,
  changeRecord,
  decodeRecord,
  emptyForm,
  validateForm,
  putRecord,
  archiveRecords
} from '../../src/lib/records.ts';
import { selectReportRows } from '../../src/lib/reporting.ts';

const at = '2026-10-31T01:00:00.000Z';
const date = '2026-10-31';
const actor = 'Test actor';

test('every record kind can be created, edited and archived without losing required fields', () => {
  const records = structuredClone(initialRecords);
  for (const module of recordModules) {
    const form = { ...emptyForm(module, date), name: 'New record', amount: 25 };
    const record = buildRecord(module, form, 'new-' + module, at, actor);
    putRecord(records, record);
    const updated = changeRecord(record, { notes: 'Follow up' }, at, actor);
    putRecord(records, updated);
    assert.equal(
      records[module].filter((item) => item.id === record.id).length,
      1
    );
    archiveRecords(records, module, [record.id], at, actor);
    const saved = records[module].find((item) => item.id === record.id);
    assert.equal(saved?.status, 'Archived');
    assert.equal(saved?.notes, 'Follow up');
    assert.equal(saved?.updatedBy, actor);
    assert.deepEqual(decodeRecord(module, saved), saved);
  }
});

test('record validation rejects missing module fields and records in the wrong collection', () => {
  const examples = [
    ['Members', 'email'],
    ['Programs', 'capacity'],
    ['Programs', 'participants'],
    ['Events', 'attendees'],
    ['Donations', 'amount'],
    ['Cases', 'priority'],
    ['Cases', 'memberId'],
    ['Administration', 'email']
  ] as const;
  for (const [module, field] of examples) {
    const invalid = { ...initialRecords[module][0] };
    Reflect.deleteProperty(invalid, field);
    assert.throws(
      () => decodeRecord(module, invalid),
      `${module}.${field} must be required`
    );
  }
  assert.throws(() => decodeRecord('Members', initialRecords.Donations[0]));
  assert.throws(() =>
    changeRecord(initialRecords.Donations[0]!, { attendees: 2 }, at, actor)
  );
});

test('names, email, calendar dates, statuses and roles are validated', () => {
  const form = {
    ...emptyForm('Members', date),
    name: '  ',
    email: 'broken',
    date: '2026-02-30',
    status: 'Unknown'
  };
  const errors = validateForm('Members', form);
  assert.ok(errors.name && errors.email && errors.date && errors.status);
  assert.throws(() => buildRecord('Members', form, 'bad', at, actor));
  assert.ok(
    validateForm('Administration', {
      ...emptyForm('Administration', date),
      name: 'User',
      type: 'Unknown'
    }).type
  );
  assert.ok(
    validateForm('Cases', {
      ...emptyForm('Cases', date),
      name: 'Case',
      priority: 'Unknown'
    }).priority
  );
  assert.deepEqual(
    validateForm('Members', {
      ...emptyForm('Members', '2028-02-29'),
      name: 'Valid',
      email: 'person@example.org'
    }),
    {}
  );
});

test('donation amounts must be finite and positive', () => {
  for (const amount of ['', undefined, 0, -1, Infinity, NaN, 'invalid']) {
    assert.ok(
      validateForm('Donations', {
        ...emptyForm('Donations', date),
        name: 'Donor',
        amount
      }).amount
    );
    assert.throws(() =>
      decodeRecord('Donations', { ...initialRecords.Donations[0], amount })
    );
  }
  const saved = buildRecord(
    'Donations',
    { ...emptyForm('Donations', date), name: 'Donor', amount: '12.50' },
    'D-new',
    at,
    actor
  );
  assert.equal(saved.kind === 'Donations' && saved.amount, 12.5);
});

test('attendance and program counts reject fractions, negatives and excess participants', () => {
  for (const attendees of [-1, 1.5, Infinity, 'invalid', '']) {
    assert.ok(
      validateForm('Events', {
        ...emptyForm('Events', date),
        name: 'Event',
        attendees
      }).attendees
    );
  }
  const form = {
    ...emptyForm('Programs', date),
    name: 'Program',
    capacity: 10,
    participants: 11
  };
  assert.ok(validateForm('Programs', form).participants);
  assert.deepEqual(validateForm('Programs', { ...form, participants: 10 }), {});
});

test('reports include both date boundaries and reject reversed ranges', () => {
  const records = initialRecords.Members;
  assert.equal(selectReportRows(records, '2026-10-20', '2026-10-22').length, 3);
  assert.equal(selectReportRows(records, '2026-10-22', '2026-10-20').length, 0);
  assert.equal(selectReportRows(records, '', '').length, records.length);
});
