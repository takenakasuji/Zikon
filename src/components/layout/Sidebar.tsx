'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PenLine, Archive, Settings } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { cn } from '@/lib/cn'

const navItems = [
  { href: '/zen', label: 'Zen', icon: PenLine },
  { href: '/kura', label: 'Kura', icon: Archive },
]

function itemClass(active: boolean): string {
  return cn(
    'flex items-center gap-2 rounded border-l-2 px-2.5 py-1.5 text-sm transition-colors',
    active
      ? 'border-[var(--primary)] bg-[var(--accent)] text-[var(--foreground)]'
      : 'border-transparent text-[var(--muted-foreground)] hover:bg-[var(--accent)]/60 hover:text-[var(--foreground)]',
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const workspace = useWorkspaceStore((s) => s.workspace)

  const wsDisplay = workspace
    ? workspace.split('/').filter(Boolean).slice(-2).join('/')
    : ''

  const settingsActive = pathname === '/settings' || pathname.startsWith('/settings/')

  return (
    <aside className="flex h-dvh w-56 flex-shrink-0 flex-col border-r border-[var(--border)] bg-[var(--muted)]">
      <div className="px-4 py-4">
        <span className="text-sm font-semibold text-[var(--foreground)]">
          Zikon
        </span>
      </div>

      <nav className="flex-1 px-2 py-2">
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <li key={item.href}>
                <Link href={item.href} className={itemClass(active)}>
                  <item.icon size={16} />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="border-t border-[var(--border)] px-2 py-3">
        <div
          className="truncate px-2.5 pb-1 text-xs text-[var(--muted-foreground)]"
          title={workspace ?? ''}
        >
          {wsDisplay || 'Not selected'}
        </div>
        <Link href="/settings" className={itemClass(settingsActive)}>
          <Settings size={16} />
          Settings
        </Link>
      </div>
    </aside>
  )
}
