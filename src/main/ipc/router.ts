import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { ZodError } from 'zod';
import {
  ipcRequestSchemas,
  isIpcChannel,
  type IpcChannel,
  type IpcErrorCode,
  type IpcResult,
} from '@shared/ipc/contract';
import { IPC_INVOKE_CHANNEL } from '@shared/ipc/transport';
import { DomainError } from '../library/errors';
import type { IpcHandlers } from './handlers';

function failure(code: IpcErrorCode, message: string): IpcResult<never> {
  return { ok: false, error: { code, message } };
}

function dispatch(handlers: IpcHandlers, channel: IpcChannel, rawRequest: unknown): unknown {
  const request: unknown = ipcRequestSchemas[channel].parse(rawRequest);
  // The schema for `channel` has just validated `request`, which TypeScript cannot follow
  // through the channel-indexed lookup - hence the single widening cast.
  const handler = handlers[channel] as (request: unknown) => unknown;
  return handler(request);
}

/**
 * Routes every renderer request to its handler after checking who is asking and
 * validating the payload. Failures are returned as data, never thrown across IPC.
 */
export function registerIpcRouter(
  handlers: IpcHandlers,
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean,
): void {
  ipcMain.handle(
    IPC_INVOKE_CHANNEL,
    async (event, channel: unknown, rawRequest: unknown): Promise<IpcResult<unknown>> => {
      if (!isTrustedSender(event)) return failure('FORBIDDEN', 'Request came from an untrusted frame.');
      if (!isIpcChannel(channel)) return failure('INVALID_REQUEST', 'Unknown request.');

      try {
        return { ok: true, value: await dispatch(handlers, channel, rawRequest) };
      } catch (error) {
        if (error instanceof DomainError) return failure(error.code, error.message);
        if (error instanceof ZodError) {
          return failure('INVALID_REQUEST', `Invalid "${channel}" request: ${error.message}`);
        }
        console.error(`IPC handler "${channel}" failed.`, error);
        return failure('INTERNAL', 'Something went wrong. Please try again.');
      }
    },
  );
}
