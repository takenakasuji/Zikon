'use client'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { NotionEditor, type NotionEditorHandle } from '@/components/editor/NotionEditor'
import { StashMenu } from '@/components/editor/StashMenu'
import { DocTitle, type DocTitleHandle } from '@/components/editor/DocTitle'

export default function ZenPage() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const active = useWorkspaceStore((s) => s.active)
  const router = useRouter()
  const titleRef = useRef<DocTitleHandle>(null)
  const editorRef = useRef<NotionEditorHandle>(null)

  useEffect(() => {
    if (!workspace) router.replace('/')
  }, [workspace, router])

  if (!workspace || !active) return null

  return (
    <>
      <header className="sticky top-0 z-sticky flex items-center justify-end border-b border-[var(--border)] bg-[var(--background)] px-6 py-2">
        <div className="flex items-center gap-1"><StashMenu /></div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pt-4 pb-12">
        <DocTitle
          ref={titleRef}
          docKey={active.id}
          onArrowDown={() => editorRef.current?.focusStart()}
        />
        <NotionEditor
          ref={editorRef}
          docKey={active.id}
          initialMarkdown={active.content}
          onArrowUpAtStart={() => titleRef.current?.focusEnd()}
        />
      </main>
    </>
  )
}
