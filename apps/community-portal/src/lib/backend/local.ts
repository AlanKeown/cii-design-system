import { initialRecords } from '../data.ts';
import type {
  PortalRecord,
  RecordForm,
  RecordModule,
  WorkspaceSnapshot
} from '../model.ts';
import {
  loadWorkspace,
  saveWorkspace,
  type StorageAccess
} from '../persistence.ts';
import {
  archiveRecords,
  buildRecord,
  decodeRecord,
  decodeViews,
  putRecord,
  recordForm,
  validateForm
} from '../records.ts';
import { selectReportRows } from '../reporting.ts';
import { PortalBackendError, type PortalBackend } from './types.ts';

export const localActor = 'Sarah Mitchell';

export interface PersistenceStatus {
  saved: boolean;
  recoveryNeeded: boolean;
  message: string;
}

export interface LocalBackend extends PortalBackend {
  readonly mode: 'local';
  readSnapshot(): WorkspaceSnapshot;
  persistenceStatus(): PersistenceStatus;
  setDark(dark: boolean): void;
  replaceSavedWorkspace(): void;
  // Activity descriptions are a local demo concern, never trusted server metadata.
  updateRecord(
    record: PortalRecord,
    expectedUpdatedAt?: string,
    activity?: string
  ): Promise<PortalRecord>;
}

interface LocalOptions {
  storage: () => StorageAccess;
  actor?: string;
  now?: () => string;
  uuid?: () => string;
}

export function createLocalBackend({
  storage: getStorage,
  actor = localActor,
  now = () => new Date().toISOString(),
  uuid = () => crypto.randomUUID()
}: LocalOptions): LocalBackend {
  let snapshot: WorkspaceSnapshot = {
    records: structuredClone(initialRecords),
    audit: [],
    savedViews: [],
    dark: false
  };
  let storage: StorageAccess | undefined;
  let writable = false;
  let status: PersistenceStatus = {
    saved: false,
    recoveryNeeded: false,
    message: ''
  };

  function persist(): void {
    if (!writable || !storage) return;
    try {
      saveWorkspace(storage, snapshot);
      status = { saved: true, recoveryNeeded: false, message: '' };
    } catch {
      status = {
        ...status,
        saved: false,
        message:
          'Changes could not be saved in this browser. Export your records before leaving.'
      };
    }
  }

  try {
    storage = getStorage();
    const result = loadWorkspace(storage);
    if (result.status === 'loaded' || result.status === 'empty') {
      if (result.status === 'loaded') snapshot = result.snapshot;
      writable = true;
      persist();
    } else {
      status = {
        saved: false,
        recoveryNeeded: result.status === 'invalid',
        message: result.message
      };
    }
  } catch {
    status = {
      saved: false,
      recoveryNeeded: false,
      message:
        'Browser storage is unavailable. Changes cannot be saved; export your work before leaving.'
    };
  }

  function validate(module: RecordModule, form: RecordForm): void {
    const errors = validateForm(module, form);
    if (Object.keys(errors).length)
      throw new PortalBackendError(
        'invalid',
        'Check the highlighted fields.',
        errors
      );
  }

  function log(action: string, record: string, at: string): void {
    snapshot.audit.unshift({ action, record, by: actor, at });
  }

  function checked<T>(decode: () => T): T {
    try {
      return decode();
    } catch {
      throw new PortalBackendError(
        'invalid',
        'The supplied values are invalid.'
      );
    }
  }

  // Mutations complete synchronously before their Promise resolves. Each operation
  // reads the latest snapshot, so concurrent calls cannot lose previous writes.
  return {
    mode: 'local',
    readSnapshot: () => structuredClone(snapshot),
    persistenceStatus: () => ({ ...status }),
    setDark(dark) {
      snapshot.dark = dark;
      persist();
    },
    replaceSavedWorkspace() {
      if (!storage || !status.recoveryNeeded) return;
      writable = true;
      persist();
      if (status.recoveryNeeded) writable = false;
    },
    async createRecord(module, form) {
      validate(module, form);
      const id = module[0] + '-' + uuid();
      if (snapshot.records[module].some((record) => record.id === id))
        throw new PortalBackendError(
          'conflict',
          'This record already exists. Please try again.'
        );
      const at = now();
      const record = buildRecord(module, form, id, at, actor);
      putRecord(snapshot.records, record);
      log('Created', record.name, at);
      persist();
      return structuredClone(record);
    },
    async updateRecord(record, expectedUpdatedAt, activity = 'Updated') {
      const current = snapshot.records[record.kind].find(
        (item) => item.id === record.id
      );
      if (!current)
        throw new PortalBackendError(
          'invalid',
          'This record no longer exists.'
        );
      if (
        expectedUpdatedAt !== undefined &&
        current.updatedAt !== expectedUpdatedAt
      )
        throw new PortalBackendError(
          'conflict',
          'This record changed. Reopen it before saving again.'
        );
      const form = checked(() => recordForm(decodeRecord(record.kind, record)));
      validate(record.kind, form);
      const at = now();
      const updated = buildRecord(record.kind, form, record.id, at, actor);
      putRecord(snapshot.records, updated);
      log(activity, updated.name, at);
      persist();
      return structuredClone(updated);
    },
    async archiveRecords(module, ids) {
      const uniqueIds = [...new Set(ids)];
      if (
        uniqueIds.some(
          (id) => !snapshot.records[module].some((record) => record.id === id)
        )
      )
        throw new PortalBackendError(
          'invalid',
          'A selected record no longer exists.'
        );
      if (!uniqueIds.length) return [];
      const at = now();
      archiveRecords(snapshot.records, module, uniqueIds, at, actor);
      log('Archived', uniqueIds.length + ' ' + module.toLowerCase(), at);
      persist();
      return structuredClone(
        snapshot.records[module].filter((record) =>
          uniqueIds.includes(record.id)
        )
      );
    },
    async saveView(view) {
      const [validated] = checked(() => decodeViews([view]));
      if (!validated)
        throw new PortalBackendError('invalid', 'No saved view was supplied.');
      snapshot.savedViews.push(validated);
      persist();
      return structuredClone(validated);
    },
    async reportRows(module, from, to) {
      return structuredClone(
        selectReportRows(snapshot.records[module], from, to)
      );
    },
    async resetDemoData() {
      snapshot = {
        records: structuredClone(initialRecords),
        audit: [],
        savedViews: [],
        dark: snapshot.dark
      };
      persist();
    }
  };
}
