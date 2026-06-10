import { describe, it, expect, beforeEach } from 'vitest'
import { useThemeStore } from './themeStore'
beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute('data-theme'); useThemeStore.setState({ theme: 'system' }) })
describe('themeStore', () => {
  it('setTheme persists and applies data-theme for explicit themes', () => {
    useThemeStore.getState().setTheme('light')
    expect(useThemeStore.getState().theme).toBe('light')
    expect(localStorage.getItem('zikon-theme')).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })
  it('system removes the data-theme attribute (falls back to prefers-color-scheme)', () => {
    useThemeStore.getState().setTheme('dark')
    useThemeStore.getState().setTheme('system')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(localStorage.getItem('zikon-theme')).toBe('system')
  })
})
