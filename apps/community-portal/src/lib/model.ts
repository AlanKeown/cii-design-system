export const recordModules = [
  'Members',
  'Programs',
  'Events',
  'Donations',
  'Cases',
  'Administration'
] as const;
export type RecordModule = (typeof recordModules)[number];
export type Module = RecordModule | 'Dashboard' | 'Reports';
export const roles = [
  'Admin',
  'Staff',
  'Volunteer Coordinator',
  'Donations Manager',
  'Case Worker',
  'Board Member'
] as const;
export type Role = (typeof roles)[number];
export const statuses = {
  Members: ['Active', 'Pending', 'Inactive', 'Archived'],
  Programs: ['Active', 'Pending', 'Inactive', 'Archived'],
  Events: ['Upcoming', 'Completed', 'Cancelled', 'Archived'],
  Donations: ['Needs receipt', 'Acknowledged', 'Archived'],
  Cases: ['Open', 'In progress', 'Closed', 'Archived'],
  Administration: ['Active', 'Pending', 'Inactive', 'Archived']
} as const;
export const priorities = ['Normal', 'High', 'Urgent'] as const;

interface BaseRecord<M extends RecordModule> {
  kind: M;
  id: string;
  name: string;
  status: (typeof statuses)[M][number];
  type: string;
  location: string;
  date: string;
  notes?: string;
  updatedBy?: string;
  updatedAt?: string;
}
export interface MemberRecord extends BaseRecord<'Members'> {
  email: string;
  phone?: string;
  tags?: string;
  programId?: string;
}
export interface ProgramRecord extends BaseRecord<'Programs'> {
  capacity: number;
  participants: number;
}
export interface EventRecord extends BaseRecord<'Events'> {
  attendees: number;
}
export interface DonationRecord extends BaseRecord<'Donations'> {
  amount: number;
}
export interface CaseRecord extends BaseRecord<'Cases'> {
  priority: (typeof priorities)[number];
  memberId: string;
}
export interface UserRecord extends BaseRecord<'Administration'> {
  email: string;
  type: Role;
}
export interface RecordByModule {
  Members: MemberRecord;
  Programs: ProgramRecord;
  Events: EventRecord;
  Donations: DonationRecord;
  Cases: CaseRecord;
  Administration: UserRecord;
}
export type PortalRecord = RecordByModule[RecordModule];
export type PortalRecords = { [M in RecordModule]: RecordByModule[M][] };
export const sortKeys = ['name', 'status', 'date'] as const;
export type SortKey = (typeof sortKeys)[number];

// Editable values are separate from validated, persisted records.
export interface RecordForm {
  name: string;
  status: string;
  type: string;
  location: string;
  date: string;
  email: string;
  phone: string;
  tags: string;
  notes: string;
  programId: string;
  memberId: string;
  priority: string;
  amount: number | string | undefined;
  capacity: number | string | undefined;
  participants: number | string | undefined;
  attendees: number | string | undefined;
}
export type ValidationField = keyof RecordForm;
export type FormErrors = Partial<Record<ValidationField, string>>;
export interface SavedView {
  name: string;
  module: RecordModule;
  query: string;
  status: string;
  sort: SortKey;
}
export interface AuditEntry {
  action: string;
  record: string;
  by: string;
  at: string;
}
export interface WorkspaceSnapshot {
  records: PortalRecords;
  savedViews: SavedView[];
  audit: AuditEntry[];
  dark: boolean;
}

export function isRecordModule(value: string): value is RecordModule {
  return recordModules.some((module) => module === value);
}
export function recordValue(
  record: PortalRecord,
  key: string
): string | number | undefined {
  const value: unknown = Reflect.get(record, key);
  return typeof value === 'string' || typeof value === 'number'
    ? value
    : undefined;
}
