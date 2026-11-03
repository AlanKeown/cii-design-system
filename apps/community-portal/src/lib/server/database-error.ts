import type { BackendError } from '../backend/types.ts';
export function databaseError(value: { code?: string; message?: string }): {
  status: number;
  error: BackendError;
} {
  if (value.code === '42501')
    return {
      status: 403,
      error: {
        code: 'forbidden',
        message: 'You do not have permission to do this.'
      }
    };
  if (value.code === '23505')
    return {
      status: 409,
      error: {
        code: 'conflict',
        message: 'This record already exists. Reload and try again.'
      }
    };
  if (value.message?.includes('ORG_ROW_LIMIT') || value.code === '54000')
    return {
      status: 409,
      error: {
        code: 'limit',
        message:
          'This demo has reached its limit. Remove unused data or reset the workspace.'
      }
    };
  if (
    value.code?.startsWith('22') ||
    value.code?.startsWith('23') ||
    value.message === 'INVITATION_INVALID'
  )
    return {
      status: 400,
      error: {
        code: 'invalid',
        message:
          value.message === 'INVITATION_INVALID'
            ? 'This invitation is invalid, expired, used, or intended for a different email address.'
            : 'Check the entered values and related records.'
      }
    };
  return {
    status: 503,
    error: {
      code: 'offline',
      message: 'The workspace could not be loaded or saved. Please try again.'
    }
  };
}
