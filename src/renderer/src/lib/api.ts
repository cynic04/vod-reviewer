import type { IpcChannel, IpcErrorCode, IpcRequest, IpcResponse } from '@shared/ipc/contract';

/** A request to the main process was refused. `message` is written for the user. */
export class ApiError extends Error {
  readonly code: IpcErrorCode;

  constructor(code: IpcErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

/** Calls the main process and unwraps the result, throwing an {@link ApiError} on failure. */
export async function invoke<C extends IpcChannel>(
  channel: C,
  ...args: IpcRequest<C> extends undefined ? [] : [request: IpcRequest<C>]
): Promise<IpcResponse<C>> {
  const result = await window.vodReviewer.invoke(channel, ...args);
  if (!result.ok) throw new ApiError(result.error.code, result.error.message);
  return result.value;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}
