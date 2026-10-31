import type { RecordForm, RecordModule, WorkspaceSnapshot } from './model.ts';
import {
  decodeRecords,
  decodeViews,
  decodeAudit,
  decodeDraft,
  object
} from './records.ts';

export const workspaceKey = 'community-portal-v1';
export const draftKey = (module: RecordModule) => 'community-draft-' + module;
export type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>;
export type LoadResult =
  | { status: 'empty' }
  | { status: 'loaded'; snapshot: WorkspaceSnapshot }
  | { status: 'invalid' | 'unavailable'; message: string };

export function decodeSnapshot(value: unknown): WorkspaceSnapshot {
  const snapshot = object(value);
  if (
    snapshot.version !== undefined &&
    snapshot.version !== 1 &&
    snapshot.version !== 2
  )
    throw new Error('Unsupported workspace version.');
  const legacy = snapshot.version !== 2;
  if (snapshot.dark !== undefined && typeof snapshot.dark !== 'boolean')
    throw new Error('Invalid theme setting.');
  return {
    records: decodeRecords(snapshot.records, legacy),
    audit: decodeAudit(
      snapshot.audit === undefined && legacy ? [] : snapshot.audit
    ),
    savedViews: decodeViews(
      snapshot.savedViews === undefined && legacy ? [] : snapshot.savedViews
    ),
    dark: snapshot.dark ?? false
  };
}
export function loadWorkspace(storage: StorageAccess): LoadResult {
  let saved: string | null;
  try {
    saved = storage.getItem(workspaceKey);
  } catch {
    return {
      status: 'unavailable',
      message:
        'Browser storage is unavailable. Changes cannot be saved; export your work before leaving.'
    };
  }
  if (saved === null) return { status: 'empty' };
  try {
    const value: unknown = JSON.parse(saved);
    return { status: 'loaded', snapshot: decodeSnapshot(value) };
  } catch {
    return {
      status: 'invalid',
      message:
        'Saved data could not be loaded. Demo records are available. Automatic saving is paused to preserve the original data.'
    };
  }
}
export function saveWorkspace(
  storage: StorageAccess,
  snapshot: WorkspaceSnapshot
): void {
  // Validate writes as well as reads, keeping persistence as the domain boundary.
  const validated = decodeSnapshot({ ...snapshot, version: 2 });
  storage.setItem(workspaceKey, JSON.stringify({ ...validated, version: 2 }));
}
export function saveDraft(
  storage: StorageAccess,
  module: RecordModule,
  form: RecordForm
): void {
  const envelope = {
    version: 2,
    module,
    form: {
      ...form,
      amount: form.amount ?? '',
      capacity: form.capacity ?? '',
      participants: form.participants ?? '',
      attendees: form.attendees ?? ''
    }
  };
  decodeDraft(module, envelope);
  storage.setItem(draftKey(module), JSON.stringify(envelope));
}
export function loadDraft(
  storage: StorageAccess,
  module: RecordModule
): RecordForm | null {
  const saved = storage.getItem(draftKey(module));
  if (saved === null) return null;
  const value: unknown = JSON.parse(saved);
  return decodeDraft(module, value);
}
