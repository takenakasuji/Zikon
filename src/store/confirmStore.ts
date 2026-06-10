'use client'
import { create } from 'zustand'

interface ConfirmRequest { message: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean }
interface ConfirmState {
  request: ConfirmRequest | null
  _resolve: ((v: boolean) => void) | null
  confirm: (req: ConfirmRequest) => Promise<boolean>
  resolve: (v: boolean) => void
}
export const useConfirmStore = create<ConfirmState>((set, get) => ({
  request: null,
  _resolve: null,
  confirm: (req) => new Promise<boolean>((resolve) => set({ request: req, _resolve: resolve })),
  resolve: (v) => {
    const r = get()._resolve
    set({ request: null, _resolve: null })
    r?.(v)
  },
}))
