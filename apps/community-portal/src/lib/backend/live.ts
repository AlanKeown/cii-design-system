import {
  PortalBackendError,
  type PortalBackend,
  type ReportRow
} from './types.ts';
import type {
  PortalRecord,
  RecordForm,
  RecordModule,
  SavedView
} from '../model.ts';
export function createLiveBackend(
  orgId: string,
  fetcher: typeof fetch = fetch,
  onSession: () => void = () =>
    location.assign(
      '/auth?next=' + encodeURIComponent(location.pathname + location.search)
    )
) {
  async function request<T>(
    path: string,
    method = 'POST',
    body?: unknown
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetcher('/api/' + path, {
        method,
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-portal-org': orgId },
        ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) })
      });
    } catch {
      throw new PortalBackendError(
        'offline',
        'The workspace is unavailable. Try again shortly.'
      );
    }
    if (response.status === 401) onSession();
    let result: {
      code?: import('./types.ts').BackendError['code'];
      message?: string;
      error?: string;
      fieldErrors?: import('../model.ts').FormErrors;
    };
    try {
      result = await response.json();
    } catch {
      throw new PortalBackendError(
        response.status === 401 ? 'session' : 'offline',
        'The workspace is unavailable. Reload and try again.'
      );
    }
    if (!result || typeof result !== 'object')
      throw new PortalBackendError(
        'offline',
        'The workspace returned an invalid response.'
      );
    if (!response.ok) {
      throw new PortalBackendError(
        response.status === 401 ? 'session' : (result.code ?? 'offline'),
        result.message ?? result.error ?? 'The change could not be saved.',
        result.fieldErrors
      );
    }
    return result as T;
  }
  return {
    mode: 'live' as const,
    createRecord: (module: RecordModule, form: RecordForm) =>
      request<PortalRecord>('records/' + module, 'POST', { form }),
    updateRecord: (record: PortalRecord, expectedUpdatedAt?: string) =>
      request<PortalRecord>(
        'records/' + record.kind + '/' + encodeURIComponent(record.id),
        'PATCH',
        { record, expectedUpdatedAt }
      ),
    archiveRecords: (module: RecordModule, ids: string[]) =>
      request<PortalRecord[]>('records/' + module + '/archive', 'POST', {
        ids
      }),
    saveView: (view) => request<SavedView>('views', 'POST', view),
    reportRows: (module, from, to) =>
      request<ReportRow[]>(
        'reports/' + module + '?' + new URLSearchParams({ from, to }),
        'GET'
      ),
    resetDemoData: () => request<void>('workspace/reset'),
    request
  } satisfies PortalBackend & { request: typeof request };
}
