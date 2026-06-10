'use client'
import { useRouter } from 'next/navigation'
import { open } from '@tauri-apps/plugin-dialog'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { useState } from 'react'

export function WelcomeScreen() {
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace)
  const router = useRouter()
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handlePick = async () => {
    setErr(null)
    setBusy(true)
    try {
      const picked = await open({ directory: true, multiple: false })
      if (!picked) {
        setBusy(false)
        return
      }
      const path = typeof picked === 'string' ? picked : picked[0]
      await setWorkspace(path)
      router.replace('/zen')
    } catch (e) {
      setErr(String(e))
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[var(--background)] text-[var(--foreground)]">
      <div className="max-w-md text-center">
        <h1 className="mb-3 text-balance text-3xl font-bold">Zikon</h1>
        <p className="mb-8 text-pretty text-sm text-[var(--muted-foreground)]">
          Choose a folder to store your documents.
          Your <code className="rounded bg-[var(--muted)] px-1 py-0.5 text-xs">.md</code> files will be saved inside this folder.
        </p>
        <button
          type="button"
          onClick={handlePick}
          disabled={busy}
          className="rounded-md bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-[var(--on-primary)] hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Loading…' : 'Choose folder'}
        </button>
        {err && (
          <p className="mt-4 text-xs text-[var(--danger)]">{err}</p>
        )}
      </div>
    </div>
  )
}
