export type AppErrorCode =
  | 'VALIDATION_ERROR'
  | 'LABORATORY_NOT_FOUND'
  | 'TIME_CONFLICT'
  | 'CONFIGURATION_CONFLICT'
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
