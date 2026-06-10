'use client'
import { create } from 'zustand'

export type ToastKind = 'info' | 'success' | 'error'

export interface Toast {
  id: string
  kind: ToastKind
  message: string
}

interface ToastState {
  toasts: Toast[]
  push: (t: { kind: ToastKind; message: string; durationMs?: number }) => string
  dismiss: (id: string) => void
}

let counter = 0
function nextId(): string {
  counter += 1
  return `t${counter}`
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: ({ kind, message, durationMs = 4000 }) => {
    const id = nextId()
    set({ toasts: [...get().toasts, { id, kind, message }] })
    if (durationMs > 0 && typeof window !== 'undefined') {
      window.setTimeout(() => get().dismiss(id), durationMs)
    }
    return id
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}))
