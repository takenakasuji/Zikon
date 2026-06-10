'use client'
import { useEffect } from 'react'
import { Sun, Moon, Monitor, type LucideIcon } from 'lucide-react'
import { useThemeStore, type Theme } from '@/store/themeStore'
import { cn } from '@/lib/cn'

const OPTIONS: { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

export function ThemeSetting() {
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const init = useThemeStore((s) => s.init)

  // no-flash スクリプトが DOM には適用済み。ここでは store の値を実際の設定に同期する。
  useEffect(() => { init() }, [init])

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--muted)] p-1"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = theme === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(value)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
              active
                ? 'bg-[var(--accent)] text-[var(--foreground)]'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
            )}
          >
            <Icon size={15} />
            {label}
          </button>
        )
      })}
    </div>
  )
}
