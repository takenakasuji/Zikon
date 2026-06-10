'use client'
import { useState } from 'react'
import { Popover } from '@base-ui/react/popover'
import { Archive, X } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { useToastStore } from '@/store/toastStore'
import { useConfirmStore } from '@/store/confirmStore'
import { deleteStash } from '@/lib/fs'
import { cn } from '@/lib/cn'
import type { FileEntry } from '@/types'

function formatRelative(ms: number): string {
  const diff = Date.now() - ms
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'Just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}h ago`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day}d ago`
  return new Date(ms).toLocaleDateString('en-US')
}

export function StashMenu() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const stashes = useWorkspaceStore((s) => s.stashes)
  const reloadStashes = useWorkspaceStore((s) => s.reloadStashes)
  const openStash = useWorkspaceStore((s) => s.openStash)
  const pushToast = useToastStore((s) => s.push)

  const [open, setOpen] = useState(false)

  const handleRestore = async (s: FileEntry) => {
    if (!workspace) return
    try {
      // 取り出し: stash の中身を作業ドキュメントとして開く（元は save/stash まで Stash に残る）
      await openStash(s.name)
      setOpen(false)
      pushToast({ kind: 'success', message: `Opened "${s.title || 'Untitled'}"` })
    } catch {
      pushToast({ kind: 'error', message: `Couldn't restore "${s.title || 'Untitled'}"` })
    }
  }

  const handleDelete = async (s: FileEntry) => {
    if (!workspace) return
    const ok = await useConfirmStore.getState().confirm({
      message: `Delete "${s.title || 'Untitled'}"?`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      destructive: true,
    })
    if (!ok) return
    try {
      await deleteStash(workspace, s.name)
      await reloadStashes()
    } catch {
      pushToast({ kind: 'error', message: `Couldn't delete "${s.title || 'Untitled'}"` })
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        title="Stash"
        className={cn(
          'flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--accent)]',
          open && 'bg-[var(--accent)]',
        )}
      >
        <span>Stash</span>
        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded bg-[var(--muted)] px-1 text-[10px] tabular-nums text-[var(--muted-foreground)]">
          {stashes.length}
        </span>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={4} className="z-dropdown">
          <Popover.Popup className="animate-pop-in w-80 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--popover)] shadow-popover">
            {stashes.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-3 py-8 text-center text-xs text-[var(--muted-foreground)]">
                <Archive size={20} strokeWidth={1.5} />
                <span>No stashes</span>
              </div>
            ) : (
              <ul className="max-h-96 overflow-y-auto">
                {stashes.map((s) => (
                  <li
                    key={s.name}
                    className="group flex items-start gap-2 border-b border-[var(--border)] px-3 py-2.5 last:border-b-0 hover:bg-[var(--accent)]"
                  >
                    <button
                      type="button"
                      onClick={() => handleRestore(s)}
                      className="min-w-0 flex-1 text-left"
                      title="Restore"
                    >
                      <div className="truncate text-sm font-medium text-[var(--foreground)]">
                        {s.title || 'Untitled'}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">
                        {s.name}
                      </div>
                      <div className="mt-1 text-[10px] tabular-nums text-[var(--muted-foreground)]">
                        Stashed {formatRelative(s.mtimeMs)}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(s)}
                      title="Delete"
                      aria-label={`Delete ${s.title || 'Untitled'}`}
                      className="mt-0.5 rounded p-1 text-[var(--muted-foreground)] opacity-0 transition-opacity hover:bg-[var(--background)] hover:text-[var(--foreground)] group-hover:opacity-100"
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
