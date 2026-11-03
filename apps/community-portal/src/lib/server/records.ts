import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../backend/database.types.ts';
import type { PortalRecord, RecordModule } from '../model.ts';
import { decodeRecord } from '../records.ts';
export const tables = {
  Members: 'members',
  Programs: 'programs',
  Events: 'events',
  Donations: 'donations',
  Cases: 'cases'
} as const;
export type DataModule = keyof typeof tables;
export function isDataModule(value: string): value is DataModule {
  return Object.hasOwn(tables, value);
}
export function fromRow(
  module: DataModule,
  row: Record<string, unknown>,
  actor?: string
): PortalRecord {
  return decodeRecord(module, {
    ...row,
    kind: module,
    notes: row.notes ?? undefined,
    phone: row.phone ?? undefined,
    tags: row.tags ?? undefined,
    programId: row.program_id ?? undefined,
    memberId: row.member_id,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ? (actor ?? 'Organisation member') : undefined
  });
}
export function toRow(record: PortalRecord, org: string) {
  const base = {
    org_id: org,
    id: record.id,
    name: record.name,
    type: record.type,
    location: record.location,
    date: record.date,
    notes: record.notes ?? null
  };
  switch (record.kind) {
    case 'Members':
      return {
        ...base,
        status: record.status,
        email: record.email,
        phone: record.phone ?? null,
        tags: record.tags ?? null,
        program_id: record.programId || null
      } satisfies Database['public']['Tables']['members']['Insert'];
    case 'Programs':
      return {
        ...base,
        status: record.status,
        capacity: record.capacity,
        participants: record.participants
      } satisfies Database['public']['Tables']['programs']['Insert'];
    case 'Events':
      return {
        ...base,
        status: record.status,
        attendees: record.attendees
      } satisfies Database['public']['Tables']['events']['Insert'];
    case 'Donations':
      return {
        ...base,
        status: record.status,
        amount: record.amount
      } satisfies Database['public']['Tables']['donations']['Insert'];
    case 'Cases':
      return {
        ...base,
        status: record.status,
        priority: record.priority,
        member_id: record.memberId
      } satisfies Database['public']['Tables']['cases']['Insert'];
    default:
      throw new Error('Use the membership functions for organisation users.');
  }
}
export function emptyRecords() {
  return {
    Members: [],
    Programs: [],
    Events: [],
    Donations: [],
    Cases: [],
    Administration: []
  } as import('../model.ts').PortalRecords;
}

export async function insertRecord(
  client: SupabaseClient<Database>,
  record: PortalRecord,
  org: string
) {
  // Empty codes are assigned under the database's organisation/table lock.
  const row = { ...toRow(record, org), id: '' };
  switch (record.kind) {
    case 'Members':
      return client
        .from('members')
        .insert(row as Database['public']['Tables']['members']['Insert'])
        .select()
        .single();
    case 'Programs':
      return client
        .from('programs')
        .insert(row as Database['public']['Tables']['programs']['Insert'])
        .select()
        .single();
    case 'Events':
      return client
        .from('events')
        .insert(row as Database['public']['Tables']['events']['Insert'])
        .select()
        .single();
    case 'Donations':
      return client
        .from('donations')
        .insert(row as Database['public']['Tables']['donations']['Insert'])
        .select()
        .single();
    case 'Cases':
      return client
        .from('cases')
        .insert(row as Database['public']['Tables']['cases']['Insert'])
        .select()
        .single();
    default:
      throw new Error(
        'Organisation users must be managed through invitations.'
      );
  }
}

/** Enforce report redaction at the HTTP boundary as well as inside the RPC. */
export function deidentifiedRow(
  module: DataModule,
  row: Record<string, unknown>
) {
  const fields = [
    'id',
    'status',
    'type',
    'location',
    'date',
    ...{
      Members: [],
      Programs: ['capacity', 'participants'],
      Events: ['attendees'],
      Donations: ['amount'],
      Cases: ['priority']
    }[module]
  ];
  return {
    ...Object.fromEntries(
      fields
        .filter((key) => Object.hasOwn(row, key))
        .map((key) => [key, row[key]])
    ),
    kind: module
  };
}
