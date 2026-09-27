import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  /** Texto opcional de apoio (ex.: detalhe técnico curto). */
  detail?: string;
}

const DEFAULT_DURATION: Record<ToastKind, number> = {
  success: 4000,
  error: 6500,
  info: 4000,
  warning: 6000,
};

/**
 * Notificações globais (toasts).
 *
 * Signals + `setTimeout`: sem dependência de biblioteca de UI. O componente
 * `app-toast-container` fica no shell e renderiza a pilha.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly toasts = signal<Toast[]>([]);
  readonly items = this.toasts.asReadonly();

  private nextId = 1;

  show(message: string, kind: ToastKind = 'info', detail?: string, duration?: number): number {
    const id = this.nextId++;
    this.toasts.update((current) => [...current, { id, kind, message, detail }]);
    const ttl = duration ?? DEFAULT_DURATION[kind];
    setTimeout(() => this.dismiss(id), ttl);
    return id;
  }

  success(message: string, detail?: string): void {
    this.show(message, 'success', detail);
  }

  error(message: string, detail?: string): void {
    this.show(message, 'error', detail);
  }

  info(message: string, detail?: string): void {
    this.show(message, 'info', detail);
  }

  warning(message: string, detail?: string): void {
    this.show(message, 'warning', detail);
  }

  dismiss(id: number): void {
    this.toasts.update((current) => current.filter((toast) => toast.id !== id));
  }

  clear(): void {
    this.toasts.set([]);
  }
}
