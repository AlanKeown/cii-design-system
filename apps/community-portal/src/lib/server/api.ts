import { error, json, type RequestEvent } from '@sveltejs/kit';
import { databaseError } from './database-error.ts';
import type { BackendError } from '../backend/types.ts';
export function apiError(
  status: number,
  code: BackendError['code'],
  message: string
): never {
  error(status, message, { code });
}
export function requireUser(locals: App.Locals) {
  if (!locals.user || !locals.supabase)
    apiError(401, 'session', 'Sign in to continue.');
  return { client: locals.supabase, user: locals.user };
}
export function checked<T>(result: {
  data: T;
  error: { code?: string; message?: string } | null;
}): T {
  if (result.error) {
    const mapped = databaseError(result.error);
    error(mapped.status, mapped.error.message, { code: mapped.error.code });
  }
  return result.data;
}
export async function jsonBody(
  event: RequestEvent
): Promise<Record<string, unknown>> {
  if (
    event.request.headers.get('content-type')?.split(';')[0].trim() !==
    'application/json'
  )
    apiError(415, 'invalid', 'Send an application/json body.');
  const origin = event.request.headers.get('origin');
  if (origin && origin !== event.url.origin)
    apiError(403, 'forbidden', 'This request is not allowed.');
  if (Number(event.request.headers.get('content-length') ?? 0) > 32_768)
    apiError(413, 'limit', 'The request is too large.');
  const text = await event.request.text();
  if (text.length > 32_768) apiError(413, 'limit', 'The request is too large.');
  try {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === 'object' && !Array.isArray(body))
      return body as Record<string, unknown>;
  } catch {
    /* Respond with a safe, stable validation error. */
  }
  apiError(400, 'invalid', 'Send a valid JSON object.');
}
export function stringValue(value: unknown, max = 200): string {
  if (typeof value !== 'string' || value.length > max)
    apiError(400, 'invalid', 'Check the entered values.');
  return value;
}
export function uuid(value: unknown): string {
  const id = stringValue(value, 36);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    apiError(400, 'invalid', 'Choose a valid organisation or user.');
  return id;
}
export function reply(data: unknown) {
  return json(data, { headers: { 'cache-control': 'private, no-store' } });
}
