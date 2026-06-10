'use client'
import { create } from 'zustand'

export type Theme = 'system' | 'light' | 'dark'
const KEY = 'zikon-theme'

function apply(theme: Theme) {
  if (typeof document === 'undefined') return
  if (theme === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', theme)
}
function load(): Theme {
  if (typeof localStorage === 'undefined') return 'system'
  const v = localStorage.getItem(KEY)
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
}
interface ThemeState {
  theme: Theme
  setTheme: (t: Theme) => void
  init: () => void
}
export const useThemeStore = create<ThemeState>((set) => ({
  theme: 'system',
  setTheme: (t) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, t)
    apply(t)
    set({ theme: t })
  },
  init: () => {
    const t = load()
    apply(t)
    set({ theme: t })
  },
}))
