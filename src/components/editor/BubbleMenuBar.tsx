'use client'
import { BubbleMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import { Bold, Italic, Strikethrough, Code, Link as LinkIcon, RemoveFormatting, Heading1, Heading2, Heading3 } from 'lucide-react'
import { cn } from '@/lib/cn'

interface BubbleMenuBarProps {
  editor: Editor | null
}

function normalizeUrl(raw: string): string {
  const url = raw.trim()
  if (url === '') return ''
  if (/^(https?:\/\/|mailto:|#|\/)/.test(url)) return url
  return `https://${url}`
}

export function BubbleMenuBar({ editor }: BubbleMenuBarProps) {
  const [linkEditing, setLinkEditing] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (linkEditing) inputRef.current?.focus()
  }, [linkEditing])

  // 選択が変わったら（メニューが隠れる/別箇所を選ぶ）リンク編集モードを必ず解除し、
  // 次回表示時に古い入力状態が残らないようにする
  useEffect(() => {
    if (!editor) return
    const reset = () => setLinkEditing(false)
    editor.on('selectionUpdate', reset)
    return () => {
      editor.off('selectionUpdate', reset)
    }
  }, [editor])

  if (!editor) return null

  const startLinkEdit = () => {
    const prev = (editor.getAttributes('link').href as string | undefined) ?? ''
    setLinkUrl(prev)
    setLinkEditing(true)
  }

  const applyLink = () => {
    const url = normalizeUrl(linkUrl)
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
    setLinkEditing(false)
  }

  const removeLink = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    setLinkEditing(false)
  }

  const btn = (active: boolean) =>
    cn(
      'px-2 py-1 text-sm rounded transition-colors',
      active
        ? 'bg-[var(--accent)] text-[var(--primary)]'
        : 'text-[var(--foreground)] hover:bg-[var(--accent)]',
    )

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: 'top' }}
      className="flex items-center gap-0.5 rounded-md border border-[var(--border)] bg-[var(--popover)] px-1 py-0.5 shadow-popover"
    >
      {linkEditing ? (
        <div className="flex items-center gap-1 px-1">
          <input
            ref={inputRef}
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                applyLink()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setLinkEditing(false)
              }
            }}
            placeholder="https://…"
            className="w-56 rounded border border-[var(--border)] bg-[var(--muted)] px-2 py-1 text-sm text-[var(--foreground)] outline-none"
          />
          <button type="button" onClick={applyLink} className={btn(false)} title="Apply">Apply</button>
          <button type="button" onClick={removeLink} className={btn(false)} title="Remove link">Remove</button>
        </div>
      ) : (
        <>
          <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={btn(editor.isActive('heading', { level: 1 }))} title="Heading 1" aria-label="Heading 1"><Heading1 size={16} /></button>
          <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(editor.isActive('heading', { level: 2 }))} title="Heading 2" aria-label="Heading 2"><Heading2 size={16} /></button>
          <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btn(editor.isActive('heading', { level: 3 }))} title="Heading 3" aria-label="Heading 3"><Heading3 size={16} /></button>
          <span className="mx-0.5 h-4 w-px bg-[var(--border)]" />
          <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive('bold'))} title="Bold (⌘B)" aria-label="Bold"><Bold size={16} /></button>
          <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive('italic'))} title="Italic (⌘I)" aria-label="Italic"><Italic size={16} /></button>
          <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={btn(editor.isActive('strike'))} title="Strikethrough (⌘⇧S)" aria-label="Strikethrough"><Strikethrough size={16} /></button>
          <button type="button" onClick={() => editor.chain().focus().toggleCode().run()} className={btn(editor.isActive('code'))} title="Inline code (⌘E)" aria-label="Inline code"><Code size={16} /></button>
          <span className="mx-0.5 h-4 w-px bg-[var(--border)]" />
          <button type="button" onClick={startLinkEdit} className={btn(editor.isActive('link'))} title="Link" aria-label="Link"><LinkIcon size={16} /></button>
          <button type="button" onClick={() => editor.chain().focus().unsetAllMarks().run()} className={btn(false)} title="Clear formatting" aria-label="Clear formatting"><RemoveFormatting size={16} /></button>
        </>
      )}
    </BubbleMenu>
  )
}
