import { create } from 'zustand'

export type ToastType = 'info' | 'success' | 'error' | 'progress'

export interface Toast {
  id: string
  type: ToastType
  message: string
  progress?: number
}

interface ToastStore {
  toasts: Toast[]
  push(t: Omit<Toast, 'id'>): string
  update(id: string, partial: Partial<Toast>): void
  dismiss(id: string): void
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],

  push: (t) => {
    const id = Math.random().toString(36).slice(2, 10)
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }))
    if (t.type !== 'progress') {
      const delay = t.type === 'error' ? 8000 : 4000
      setTimeout(() => get().dismiss(id), delay)
    }
    return id
  },

  update: (id, partial) =>
    set((s) => ({
      toasts: s.toasts.map((t) => (t.id === id ? { ...t, ...partial } : t))
    })),

  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))
