import { create } from 'zustand';
import { errorMessage } from '@renderer/lib/api';

export interface Toast {
  id: number;
  kind: 'error' | 'info';
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push: (kind: Toast['kind'], message: string) => void;
  dismiss: (id: number) => void;
}

const TOAST_LIFETIME_MS = 6000;
let nextToastId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (kind, message) => {
    const id = nextToastId++;
    set((state) => ({ toasts: [...state.toasts, { id, kind, message }] }));
    window.setTimeout(() => get().dismiss(id), TOAST_LIFETIME_MS);
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

/** Catch-all for fire-and-forget actions: `void action().catch(reportError)`. */
export function reportError(error: unknown): void {
  useToastStore.getState().push('error', errorMessage(error));
}
