'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { ThemeSetting } from '@/components/layout/ThemeSetting'

export default function SettingsPage() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const clearWorkspace = useWorkspaceStore((s) => s.clearWorkspace)
  const router = useRouter()

  useEffect(() => {
    if (!workspace) router.replace('/')
  }, [workspace, router])

  if (!workspace) return null

  const handleChangeWorkspace = async () => {
    await clearWorkspace()
    router.replace('/welcome')
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 pt-8 pb-12">
      <h1 className="mb-8 text-balance text-2xl font-bold text-[var(--foreground)]">Settings</h1>

      <section className="mb-10">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          Workspace
        </h2>
        <div className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border)] bg-[var(--muted)] px-4 py-3">
          <span className="min-w-0 truncate text-sm text-[var(--foreground)]" title={workspace}>
            {workspace}
          </span>
          <button
            type="button"
            onClick={handleChangeWorkspace}
            className="flex-shrink-0 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
          >
            Change
          </button>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          Theme
        </h2>
        <ThemeSetting />
      </section>
    </main>
  )
}
