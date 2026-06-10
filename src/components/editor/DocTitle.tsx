'use client'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useWorkspaceStore } from '@/store/workspaceStore'

const COMMIT_MS = 800

export interface DocTitleHandle {
  /** タイトル末尾にフォーカスする（本文1行目で ↑ されたとき用） */
  focusEnd: () => void
}

interface DocTitleProps {
  docKey: string
  /** タイトルで ↓ が押されたとき（本文へフォーカスを移すために呼ぶ） */
  onArrowDown?: () => void
}

export const DocTitle = forwardRef<DocTitleHandle, DocTitleProps>(function DocTitle(
  { docKey, onArrowDown },
  ref,
) {
  const title = useWorkspaceStore((s) => s.active?.title ?? '')
  const setActiveTitle = useWorkspaceStore((s) => s.setActiveTitle)
  const [value, setValue] = useState(title)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ドキュメント切替時にローカル値を同期
  useEffect(() => {
    setValue(title)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey])

  useImperativeHandle(ref, () => ({
    focusEnd: () => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      const end = el.value.length
      el.setSelectionRange(end, end)
    },
  }), [])

  const commit = (v: string) => {
    if (v !== title) void setActiveTitle(v)
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => {
        const v = e.target.value
        setValue(v)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => commit(v), COMMIT_MS)
      }}
      onKeyDown={(e) => {
        // 1行入力なので ↓ は常に本文へ移す
        if (e.key === 'ArrowDown' && onArrowDown) {
          e.preventDefault()
          onArrowDown()
        }
      }}
      onBlur={() => {
        if (timer.current) {
          clearTimeout(timer.current)
          timer.current = null
        }
        commit(value)
      }}
      placeholder="Untitled"
      spellCheck={false}
      aria-label="Document title"
      className="no-focus-ring mb-2 w-full border-none bg-transparent text-3xl font-bold text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)]"
    />
  )
})
