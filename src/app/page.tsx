'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { loadSavedWorkspace, useWorkspaceStore } from '@/store/workspaceStore'

export default function RootPage() {
  const router = useRouter()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace)
  const [error, setError] = useState<string | null>(null)

  const bootstrap = useCallback(async () => {
    setError(null)
    if (workspace) {
      router.replace('/zen')
      return
    }
    let saved: string | null = null
    try {
      saved = await loadSavedWorkspace()
    } catch {
      // 設定の読込自体が失敗 → 未設定扱いで welcome へ
      router.replace('/welcome')
      return
    }
    if (!saved) {
      router.replace('/welcome')
      return
    }
    try {
      await setWorkspace(saved)
      router.replace('/zen')
    } catch (e) {
      // ワークスペースは設定済みだが読込に失敗 → welcome へ飛ばさずリトライを促す
      setError(String(e))
    }
  }, [workspace, router, setWorkspace])

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--background)] text-[var(--foreground)]">
        <p className="text-sm text-[var(--danger)]" role="alert">Failed to load workspace</p>
        <p className="max-w-md text-center text-xs text-[var(--muted-foreground)]">{error}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void bootstrap()}
            className="rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--on-primary)] hover:opacity-90"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => router.replace('/welcome')}
            className="rounded px-4 py-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            Choose another folder
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] text-[var(--muted-foreground)]">
      <span className="text-sm">Loading…</span>
    </div>
  )
}
