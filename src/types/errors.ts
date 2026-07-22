export type AppErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'LABORATORY_NOT_FOUND'
  | 'RESOURCE_NOT_FOUND'
  | 'RESERVATION_NOT_FOUND'
  | 'TIME_CONFLICT'
  | 'CAPACITY_EXCEEDED'
  | 'RESOURCE_UNAVAILABLE'
  | 'CALENDAR_SYNC_FAILED'
  | 'SETUP_REQUIRED'
  | 'BACKEND_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export interface AppError {
  code: AppErrorCode;
  message: string;
  details?: unknown;
}

export class BackendError extends Error implements AppError {
  readonly code: AppErrorCode;
  readonly details?: unknown;

  constructor(code: AppErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'BackendError';
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export function getFriendlyError(error: unknown): AppError {
  if (error instanceof BackendError) {
    return error;
  }

  return {
    code: 'INTERNAL_ERROR',
    message: 'Não foi possível concluir a operação. Tente novamente em instantes.',
  };
}
