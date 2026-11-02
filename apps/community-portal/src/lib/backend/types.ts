import type {
  AuditEntry,
  FormErrors,
  Module,
  PortalRecord,
  PortalRecords,
  RecordForm,
  RecordModule,
  Role,
  SavedView
} from '../model.ts';

export interface SessionInfo {
  displayName: string;
  orgId: string;
  orgs: { id: string; name: string; role: Role; isOwner: boolean }[];
  role: Role;
  isOwner: boolean;
}

export interface Workspace {
  records: PortalRecords;
  savedViews: SavedView[];
  audit: AuditEntry[];
  permissions: Record<Role, Module[]>;
}

export interface PortalBackend {
  readonly mode: 'local' | 'live';
  createRecord(module: RecordModule, form: RecordForm): Promise<PortalRecord>;
  updateRecord(
    record: PortalRecord,
    expectedUpdatedAt?: string
  ): Promise<PortalRecord>;
  archiveRecords(module: RecordModule, ids: string[]): Promise<PortalRecord[]>;
  saveView(view: SavedView): Promise<SavedView>;
  reportRows(
    module: RecordModule,
    from: string,
    to: string
  ): Promise<PortalRecord[]>;
  resetDemoData(): Promise<void>;
}

export interface BackendError {
  code: 'conflict' | 'forbidden' | 'limit' | 'invalid' | 'offline' | 'session';
  message: string;
  fieldErrors?: FormErrors;
}

export class PortalBackendError extends Error implements BackendError {
  readonly code: BackendError['code'];
  readonly fieldErrors?: FormErrors;

  constructor(
    code: BackendError['code'],
    message: string,
    fieldErrors?: FormErrors
  ) {
    super(message);
    this.name = 'PortalBackendError';
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function backendError(error: unknown): BackendError {
  if (error instanceof PortalBackendError) return error;
  return {
    code: 'offline',
    message: 'Changes could not be saved. Please try again.'
  };
}
