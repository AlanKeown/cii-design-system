import {
  priorities,
  roles,
  statuses,
  recordModules,
  sortKeys,
  type RecordModule,
  type RecordByModule,
  type PortalRecord,
  type PortalRecords,
  type RecordForm,
  type FormErrors,
  type SavedView,
  type AuditEntry
} from './model.ts';

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an object.');
  return value as Record<string, unknown>;
}
export function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected text.');
  return value;
}
function optionalText(value: unknown): string | undefined {
  return value === undefined ? undefined : text(value);
}
export function choice<const T extends readonly string[]>(
  value: unknown,
  choices: T
): T[number] {
  const found = choices.find((candidate) => candidate === value);
  if (found === undefined) throw new Error('Unknown option.');
  return found;
}
export function isDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
function email(value: unknown): string {
  const result = text(value);
  if (result && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))
    throw new Error('Invalid email.');
  return result;
}
function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Invalid count.');
  return value;
}
function base<M extends RecordModule>(
  module: M,
  value: Record<string, unknown>,
  legacy: boolean
) {
  if (value.kind !== module && !(legacy && value.kind === undefined))
    throw new Error('Wrong record kind.');
  const id = text(value.id),
    name = text(value.name),
    date = text(value.date);
  if (!id.trim() || !name.trim() || !isDate(date))
    throw new Error('Invalid record.');
  const updatedAt = optionalText(value.updatedAt);
  if (updatedAt !== undefined && !Number.isFinite(Date.parse(updatedAt)))
    throw new Error('Invalid timestamp.');
  return {
    kind: module,
    id,
    name,
    date,
    status: choice(value.status, statuses[module]),
    type: text(value.type),
    location: text(value.location),
    notes: optionalText(value.notes),
    updatedBy: optionalText(value.updatedBy),
    updatedAt
  };
}

export function decodeRecord<M extends RecordModule>(
  module: M,
  value: unknown,
  legacy?: boolean
): RecordByModule[M];
export function decodeRecord(
  module: RecordModule,
  value: unknown,
  legacy = false
): PortalRecord {
  const item = object(value);
  switch (module) {
    case 'Members':
      return {
        ...base('Members', item, legacy),
        email: email(item.email === undefined && legacy ? '' : item.email),
        phone: optionalText(item.phone),
        tags: optionalText(item.tags),
        programId: optionalText(item.programId)
      };
    case 'Programs': {
      const capacity = count(
        item.capacity === undefined && legacy ? 0 : item.capacity
      );
      const participants = count(
        item.participants === undefined && legacy ? 0 : item.participants
      );
      if (participants > capacity)
        throw new Error('Participants exceed capacity.');
      return { ...base('Programs', item, legacy), capacity, participants };
    }
    case 'Events':
      return {
        ...base('Events', item, legacy),
        attendees: count(
          item.attendees === undefined && legacy ? 0 : item.attendees
        )
      };
    case 'Donations': {
      if (
        typeof item.amount !== 'number' ||
        !Number.isFinite(item.amount) ||
        item.amount <= 0
      )
        throw new Error('Invalid amount.');
      return { ...base('Donations', item, legacy), amount: item.amount };
    }
    case 'Cases':
      return {
        ...base('Cases', item, legacy),
        priority: choice(item.priority, priorities),
        memberId: text(
          item.memberId === undefined && legacy ? '' : item.memberId
        )
      };
    case 'Administration':
      return {
        ...base('Administration', item, legacy),
        email: email(item.email === undefined && legacy ? '' : item.email),
        type: choice(item.type, roles)
      };
  }
}
function recordList<M extends RecordModule>(
  module: M,
  value: unknown,
  legacy: boolean
): RecordByModule[M][] {
  if (!Array.isArray(value)) throw new Error('Expected records.');
  const records = value.map((item: unknown) =>
    decodeRecord(module, item, legacy)
  );
  if (new Set(records.map((record) => record.id)).size !== records.length)
    throw new Error('Duplicate record IDs.');
  return records;
}
export function decodeRecords(value: unknown, legacy = false): PortalRecords {
  const records = object(value);
  return {
    Members: recordList('Members', records.Members, legacy),
    Programs: recordList('Programs', records.Programs, legacy),
    Events: recordList('Events', records.Events, legacy),
    Donations: recordList('Donations', records.Donations, legacy),
    Cases: recordList('Cases', records.Cases, legacy),
    Administration: recordList('Administration', records.Administration, legacy)
  };
}
export function decodeViews(value: unknown): SavedView[] {
  if (!Array.isArray(value)) throw new Error('Expected saved views.');
  return value.map((entry: unknown) => {
    const view = object(entry);
    const module = choice(view.module, recordModules);
    const status = text(view.status);
    if (status !== 'All statuses') choice(status, statuses[module]);
    return {
      name: text(view.name),
      module,
      query: text(view.query),
      status,
      sort: choice(view.sort, sortKeys)
    };
  });
}
export function decodeAudit(value: unknown): AuditEntry[] {
  if (!Array.isArray(value)) throw new Error('Expected activity.');
  return value.map((entry: unknown) => {
    const item = object(entry),
      at = text(item.at);
    if (!Number.isFinite(Date.parse(at)))
      throw new Error('Invalid activity date.');
    return {
      action: text(item.action),
      record: text(item.record),
      by: text(item.by),
      at
    };
  });
}
export function emptyForm(module: RecordModule, date: string): RecordForm {
  return {
    name: '',
    status: statuses[module][0],
    type: module === 'Administration' ? 'Staff' : '',
    location: '',
    date,
    email: '',
    phone: '',
    tags: '',
    notes: '',
    programId: '',
    memberId: '',
    priority: 'Normal',
    amount: '',
    capacity: 0,
    participants: 0,
    attendees: 0
  };
}
export function recordForm(record: PortalRecord): RecordForm {
  const form = emptyForm(record.kind, record.date);
  for (const key of [
    'name',
    'status',
    'type',
    'location',
    'email',
    'phone',
    'tags',
    'notes',
    'programId',
    'memberId',
    'priority'
  ] as const) {
    const value = Reflect.get(record, key) as unknown;
    if (value !== undefined) form[key] = text(value);
  }
  for (const key of [
    'amount',
    'capacity',
    'participants',
    'attendees'
  ] as const) {
    const value = Reflect.get(record, key) as unknown;
    if (typeof value === 'number') form[key] = value;
  }
  return form;
}
export function decodeDraft(module: RecordModule, value: unknown): RecordForm {
  const envelope = object(value);
  const draft =
    envelope.version === undefined
      ? envelope
      : (() => {
          if (envelope.version !== 2 || envelope.module !== module)
            throw new Error('Wrong draft version or module.');
          return object(envelope.form);
        })();
  const result = emptyForm(module, '');
  for (const key of ['name', 'status', 'type', 'location', 'date'] as const)
    result[key] = text(draft[key]);
  for (const key of [
    'email',
    'phone',
    'tags',
    'notes',
    'programId',
    'memberId',
    'priority'
  ] as const) {
    if (draft[key] !== undefined) result[key] = text(draft[key]);
  }
  for (const key of [
    'amount',
    'capacity',
    'participants',
    'attendees'
  ] as const) {
    const value = draft[key];
    if (value === undefined) continue;
    if (
      (typeof value !== 'string' && typeof value !== 'number') ||
      !Number.isFinite(Number(value))
    )
      throw new Error('Invalid draft number.');
    result[key] = value;
  }
  choice(result.status, statuses[module]);
  if (module === 'Cases') choice(result.priority, priorities);
  if (module === 'Administration') choice(result.type, roles);
  if (result.date && !isDate(result.date))
    throw new Error('Invalid draft date.');
  return result;
}
export function validateForm(
  module: RecordModule,
  form: RecordForm
): FormErrors {
  const errors: FormErrors = {};
  if (!form.name.trim()) errors.name = 'Enter a name or title.';
  if (!isDate(form.date)) errors.date = 'Choose a valid date.';
  if (
    ['Members', 'Administration'].includes(module) &&
    form.email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
  )
    errors.email = 'Enter a valid email address.';
  if (!statuses[module].some((status) => status === form.status))
    errors.status = 'Choose a valid status.';
  if (module === 'Administration' && !roles.some((role) => role === form.type))
    errors.type = 'Choose a valid role.';
  if (
    module === 'Cases' &&
    !priorities.some((priority) => priority === form.priority)
  )
    errors.priority = 'Choose a valid priority.';
  if (
    module === 'Donations' &&
    (!Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0)
  )
    errors.amount = 'Enter an amount greater than zero.';
  for (const key of module === 'Programs'
    ? (['capacity', 'participants'] as const)
    : module === 'Events'
      ? (['attendees'] as const)
      : []) {
    const value = form[key];
    if (
      value === '' ||
      value === undefined ||
      !Number.isSafeInteger(Number(value)) ||
      Number(value) < 0
    )
      errors[key] = 'Enter a whole number of zero or more.';
  }
  if (
    module === 'Programs' &&
    !errors.capacity &&
    !errors.participants &&
    Number(form.participants) > Number(form.capacity)
  )
    errors.participants = 'Participants cannot exceed capacity.';
  return errors;
}
export function buildRecord(
  module: RecordModule,
  form: RecordForm,
  id: string,
  at: string,
  actor: string
): PortalRecord {
  if (Object.keys(validateForm(module, form)).length)
    throw new Error('Invalid record form.');
  return decodeRecord(module, {
    ...form,
    kind: module,
    id,
    name: form.name.trim(),
    amount: Number(form.amount),
    capacity: Number(form.capacity),
    participants: Number(form.participants),
    attendees: Number(form.attendees),
    updatedBy: actor,
    updatedAt: at
  });
}

function replace<T extends PortalRecord>(items: T[], record: T): T[] {
  return items.some((item) => item.id === record.id)
    ? items.map((item) => (item.id === record.id ? record : item))
    : [record, ...items];
}
export function putRecord(records: PortalRecords, record: PortalRecord): void {
  switch (record.kind) {
    case 'Members':
      records.Members = replace(records.Members, record);
      break;
    case 'Programs':
      records.Programs = replace(records.Programs, record);
      break;
    case 'Events':
      records.Events = replace(records.Events, record);
      break;
    case 'Donations':
      records.Donations = replace(records.Donations, record);
      break;
    case 'Cases':
      records.Cases = replace(records.Cases, record);
      break;
    case 'Administration':
      records.Administration = replace(records.Administration, record);
      break;
  }
}
export function archiveRecords(
  records: PortalRecords,
  module: RecordModule,
  ids: string[],
  at: string,
  actor: string
): void {
  for (const record of records[module]) {
    if (ids.includes(record.id))
      putRecord(
        records,
        decodeRecord(module, {
          ...record,
          status: 'Archived',
          updatedBy: actor,
          updatedAt: at
        })
      );
  }
}
export type RecordChanges = {
  status?: string;
  notes?: string;
  programId?: string;
  attendees?: number;
};
export function changeRecord(
  record: PortalRecord,
  changes: RecordChanges,
  at: string,
  actor: string
): PortalRecord {
  if (changes.programId !== undefined && record.kind !== 'Members')
    throw new Error('Only members can be assigned to programs.');
  if (changes.attendees !== undefined && record.kind !== 'Events')
    throw new Error('Only events have attendance.');
  return decodeRecord(record.kind, {
    ...record,
    ...changes,
    updatedBy: actor,
    updatedAt: at
  });
}
