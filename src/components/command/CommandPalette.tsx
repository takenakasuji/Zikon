'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog } from '@base-ui/react/dialog'
import { Search } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { useToastStore } from '@/store/toastStore'
import { cn } from '@/lib/cn'

interface Cmd { id: string; label: string; run: () => void | Promise<void> }

export function CommandPalette() {
  const router = useRouter()
  const store = useWorkspaceStore
  const push = useToastStore((s) => s.push)
  const files = useWorkspaceStore((s) => s.files)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((v) => !v); return }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void store.getState().saveActive().then(() => push({ kind: 'success', message: 'Saved to Kura' })).catch(() => {})
        return
      }
      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        if (typeof document !== 'undefined') (document.activeElement as HTMLElement | null)?.blur()
        void store.getState().createNew().then(() => router.push('/zen')).catch(() => {})
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router, push, store])

  useEffect(() => { if (open) { setQuery(''); setIndex(0) } }, [open])

  const actions: Cmd[] = useMemo(() => {
    const s = store.getState()
    const go = (path: string) => () => { router.push(path); setOpen(false) }
    return [
      { id: 'new', label: 'New document', run: async () => { await s.createNew(); router.push('/zen'); setOpen(false) } },
      { id: 'save', label: 'Save to Kura', run: async () => { try { await s.saveActive(); push({ kind: 'success', message: 'Saved to Kura' }) } catch {} ; setOpen(false) } },
      { id: 'stash', label: 'Stash document', run: async () => { await s.stashActive(); setOpen(false) } },
      { id: 'zen', label: 'Open Zen', run: go('/zen') },
      { id: 'kura', label: 'Open Kura', run: go('/kura') },
      { id: 'ws', label: 'Change workspace', run: async () => { await s.clearWorkspace(); router.replace('/welcome'); setOpen(false) } },
    ]
  }, [router, push, store])

  const items: Cmd[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    const docCmds: Cmd[] = files.map((f) => ({
      id: `doc:${f.name}`,
      label: f.title || 'Untitled',
      run: async () => {
        await store.getState().openFile(f.name)
        router.push('/zen')
        setOpen(false)
      },
    }))
    const all = [...actions, ...docCmds]
    if (!q) return all
    return all.filter((c) => c.label.toLowerCase().includes(q))
  }, [query, actions, files, router, store])

  useEffect(() => { setIndex(0) }, [query])

  const run = (i: number) => { const c = items[i]; if (c) void c.run() }
  const activeId = items[index] ? `cmd-${items[index].id}` : undefined

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-overlay bg-black/50" />
        <Dialog.Popup
          initialFocus={inputRef}
          aria-label="Command palette"
          className="animate-pop-in fixed left-1/2 top-24 z-overlay w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--popover)] shadow-popover"
        >
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
            <Search size={15} className="text-[var(--muted-foreground)]" aria-hidden="true" />
            <input
              ref={inputRef}
              value={query}
              role="combobox"
              aria-expanded="true"
              aria-controls="command-list"
              aria-activedescendant={activeId}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, items.length - 1)) }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)) }
                else if (e.key === 'Enter') { e.preventDefault(); run(index) }
              }}
              placeholder="Search commands and documents…"
              className="w-full bg-transparent text-sm text-[var(--foreground)] outline-none"
            />
          </div>
          <ul id="command-list" role="listbox" aria-label="Commands and documents" className="max-h-80 overflow-y-auto py-1">
            {items.length === 0 ? (
              <li className="px-3 py-3 text-center text-xs text-[var(--muted-foreground)]">No results</li>
            ) : (
              items.map((c, i) => (
                <li key={c.id}>
                  <button
                    id={`cmd-${c.id}`}
                    type="button"
                    role="option"
                    aria-selected={i === index}
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => run(i)}
                    className={cn(
                      'block w-full px-3 py-2 text-left text-sm text-[var(--foreground)]',
                      i === index ? 'bg-[var(--accent)]' : 'hover:bg-[var(--accent)]',
                    )}
                  >
                    {c.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
