'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X, Search, SearchX } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { useConfirmStore } from '@/store/confirmStore'
import { useToastStore } from '@/store/toastStore'
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

export default function KuraPage() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const files = useWorkspaceStore((s) => s.files)
  const reloadFiles = useWorkspaceStore((s) => s.reloadFiles)
  const openFile = useWorkspaceStore((s) => s.openFile)
  const deleteFile = useWorkspaceStore((s) => s.deleteFile)
  const search = useWorkspaceStore((s) => s.search)
  const pushToast = useToastStore((s) => s.push)
  const router = useRouter()

  useEffect(() => {
    if (!workspace) router.replace('/')
  }, [workspace, router])

  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (!workspace) return
    let cancelled = false
    void (async () => {
      await reloadFiles()
      if (!cancelled) setLoaded(true)
    })()
    return () => { cancelled = true }
  }, [workspace, reloadFiles])

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FileEntry[]>([])

  useEffect(() => {
    if (query.trim() === '') {
      setResults([])
      return
    }
    const id = setTimeout(async () => {
      setResults(await search(query))
    }, 250)
    return () => clearTimeout(id)
  }, [query, search])

  if (!workspace) return null

  const handleOpen = async (name: string) => {
    try {
      await openFile(name)
      router.push('/zen')
    } catch {
      pushToast({ kind: 'error', message: 'Failed to open the document' })
    }
  }

  const handleDelete = async (name: string, title: string) => {
    const ok = await useConfirmStore.getState().confirm({
      message: `Delete "${title || 'Untitled'}"?`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      destructive: true,
    })
    if (!ok) return
    try {
      await deleteFile(name)
    } catch {
      pushToast({ kind: 'error', message: 'Failed to delete the document' })
    }
  }

  const Row = ({ f }: { f: FileEntry }) => (
    <li className="group flex items-start gap-2 px-4 py-3 hover:bg-[var(--accent)]">
      <button type="button" onClick={() => handleOpen(f.name)} className="min-w-0 flex-1 text-left">
        <div className="truncate text-sm font-medium text-[var(--foreground)]">{f.title || 'Untitled'}</div>
        <div className="mt-1 text-[10px] tabular-nums text-[var(--muted-foreground)]">
          Updated {formatRelative(f.mtimeMs)}
        </div>
      </button>
      <button
        type="button"
        onClick={() => handleDelete(f.name, f.title)}
        title="Delete"
        aria-label={`Delete ${f.title || 'Untitled'}`}
        className="mt-0.5 rounded p-1 text-[var(--muted-foreground)] opacity-0 transition-opacity hover:bg-[var(--background)] hover:text-[var(--foreground)] group-hover:opacity-100"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </li>
  )

  const SkeletonList = () => (
    <ul
      role="status"
      aria-busy="true"
      aria-label="Loading documents"
      className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)]"
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="flex flex-col gap-2 px-4 py-3" aria-hidden="true">
          <div className="h-3.5 w-1/2 rounded bg-[var(--accent)] motion-safe:animate-pulse" />
          <div className="h-2.5 w-20 rounded bg-[var(--accent)] motion-safe:animate-pulse" />
        </li>
      ))}
    </ul>
  )

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-balance text-2xl font-bold text-[var(--foreground)]">Kura</h1>
        <button
          type="button"
          onClick={() => reloadFiles()}
          className="rounded px-2.5 py-1 text-xs text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
        >
          Reload
        </button>
      </div>

      <div className="mb-6 flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--muted)] px-3 py-2">
        <Search size={15} className="text-[var(--muted-foreground)]" aria-hidden="true" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search (title and content)"
          aria-label="Search documents"
          className="w-full bg-transparent text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)]"
        />
      </div>

      {query.trim() !== '' ? (
        results.length === 0 ? (
          <div className="mt-12 flex flex-1 flex-col items-center justify-center gap-2 py-20 text-center text-sm text-[var(--muted-foreground)]">
            <SearchX size={22} strokeWidth={1.5} />
            <span>No matching documents</span>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">
            {results.map((f) => (
              <Row key={f.name} f={f} />
            ))}
          </ul>
        )
      ) : !loaded && files.length === 0 ? (
        <SkeletonList />
      ) : files.length === 0 ? (
        <div className="mt-12 flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] py-20 text-center">
          <p className="text-sm text-[var(--muted-foreground)]">No documents yet</p>
          <button
            type="button"
            onClick={() => router.push('/zen')}
            className="mt-4 rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--on-primary)] hover:opacity-90"
          >
            Write in Zen
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">
          {files.map((f) => (
            <Row key={f.name} f={f} />
          ))}
        </ul>
      )}
    </main>
  )
}
