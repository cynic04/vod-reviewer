import type { IpcErrorCode } from '@shared/ipc/contract';

/** A rule of the domain was broken. Safe to show to the user as-is. */
export class DomainError extends Error {
  readonly code: IpcErrorCode;

  constructor(code: IpcErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

export function notFound(entity: string, id: string): DomainError {
  return new DomainError('NOT_FOUND', `${entity} "${id}" does not exist.`);
}
