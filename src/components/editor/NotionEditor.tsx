'use client'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { lowlight } from './lowlight'
import { RawBlock } from './extensions/RawBlock'
import { SlashCommand } from './slash/SlashCommand'
import { BubbleMenuBar } from './BubbleMenuBar'
import { Node as PMNode, Slice } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { markdownToTiptap } from '@/lib/markdown/fromMarkdown'
import { looksLikeMarkdown } from '@/lib/markdown/detect'
import { tiptapToMarkdown } from '@/lib/markdown/toMarkdown'
import { useToastStore } from '@/store/toastStore'

const INDENT = '  '
const AUTO_SAVE_MS = 600
const MAX_IMAGE_BYTES = 2 * 1024 * 1024 // 2MB

const CodeBlockWithTab = CodeBlockLowlight.extend({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Tab: () => {
        if (!this.editor.isActive('codeBlock')) return false
        return this.editor.commands.insertContent(INDENT)
      },
      'Shift-Tab': () => {
        if (!this.editor.isActive('codeBlock')) return false
        const { state, view } = this.editor
        const { $from } = state.selection
        const text = $from.parent.textContent
        const offset = $from.parentOffset
        const lastNewline = text.slice(0, offset).lastIndexOf('\n')
        const lineStartInBlock = lastNewline === -1 ? 0 : lastNewline + 1
        const head = text.slice(lineStartInBlock, lineStartInBlock + INDENT.length)
        if (head === INDENT) {
          const lineStart = $from.start() + lineStartInBlock
          view.dispatch(state.tr.delete(lineStart, lineStart + INDENT.length))
        }
        return true
      },
      Enter: () => {
        if (!this.editor.isActive('codeBlock')) return false
        const { state, view } = this.editor
        const { $from, $to } = state.selection
        if (!$from.sameParent($to)) return false
        const text = $from.parent.textContent
        const offset = $from.parentOffset
        const lastNewline = text.slice(0, offset).lastIndexOf('\n')
        const lineStartInBlock = lastNewline === -1 ? 0 : lastNewline + 1
        const currentLine = text.slice(lineStartInBlock, offset)
        const indent = currentLine.match(/^[ \t]*/)?.[0] ?? ''
        view.dispatch(state.tr.insertText('\n' + indent).scrollIntoView())
        return true
      },
    }
  },
})

interface NotionEditorProps {
  docKey: string
  initialMarkdown: string
  /** 本文1行目で ↑ が押されたとき（タイトルへフォーカスを移すために呼ぶ） */
  onArrowUpAtStart?: () => void
}

export interface NotionEditorHandle {
  /** 本文の先頭にフォーカスする（タイトルで ↓ されたとき用） */
  focusStart: () => void
}

export const NotionEditor = forwardRef<NotionEditorHandle, NotionEditorProps>(function NotionEditor(
  { docKey, initialMarkdown, onArrowUpAtStart },
  ref,
) {
  const updateActiveContent = useWorkspaceStore((s) => s.updateActiveContent)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorRef = useRef<ReturnType<typeof useEditor> | null>(null)
  const onArrowUpRef = useRef(onArrowUpAtStart)
  const pushToast = useToastStore((s) => s.push)

  const insertImageFile = (view: EditorView, file: File) => {
    if (file.size > MAX_IMAGE_BYTES) {
      pushToast({ kind: 'error', message: 'Image is too large (up to 2MB)' })
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const src = reader.result as string
      const { schema } = view.state
      const node = schema.nodes.image.create({ src })
      view.dispatch(view.state.tr.replaceSelectionWith(node))
    }
    reader.onerror = () => pushToast({ kind: 'error', message: 'Failed to load image' })
    reader.readAsDataURL(file)
  }

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: initialMarkdown.trim() === '' ? 'start' : 'end',
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        link: false,
        underline: false,
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      CodeBlockWithTab.configure({ lowlight, defaultLanguage: 'plaintext' }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
      }),
      Image.configure({ inline: false, allowBase64: true }),
      Placeholder.configure({
        placeholder: 'Type "/" for commands, or just start writing',
        showOnlyCurrent: true,
      }),
      RawBlock,
      SlashCommand,
    ],
    content: markdownToTiptap(initialMarkdown),
    onUpdate: ({ editor }) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        // docKey が変わるとエディタは作り直され、この古い editor は destroy 済みになる。
        // 残った debounce タイマーが新しい active を上書きしないよう、書き込まずに抜ける。
        if (editor.isDestroyed) return
        const md = tiptapToMarkdown(editor.getJSON())
        updateActiveContent(md, docKey).catch(() => {})
      }, AUTO_SAVE_MS)
    },
    onBlur: ({ editor }) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      const md = tiptapToMarkdown(editor.getJSON())
      updateActiveContent(md).catch(() => {})
    },
    editorProps: {
      attributes: {
        class: 'ProseMirror',
        spellcheck: 'false',
        autocorrect: 'off',
        autocapitalize: 'off',
        autocomplete: 'off',
      },
      handleKeyDown: (view, event) => {
        // 本文の1行目（ドキュメント先頭ブロックの最上行）で ↑ → タイトルへフォーカスを移す
        if (event.key === 'ArrowUp') {
          const { selection } = view.state
          const { $head } = selection
          if (
            selection.empty &&
            $head.depth >= 1 &&
            $head.before(1) === 0 &&
            view.endOfTextblock('up')
          ) {
            const cb = onArrowUpRef.current
            if (cb) {
              event.preventDefault()
              cb()
              return true
            }
          }
        }
        return false
      },
      handlePaste: (view, event) => {
        const cd = event.clipboardData
        if (!cd) return false
        // コードブロック内では解釈せずプレーンテキスト貼り付けに任せる
        if (view.state.selection.$from.parent.type.spec.code) return false
        const imageFile = Array.from(cd.files).find((f) => f.type.startsWith('image/'))
        if (imageFile) {
          event.preventDefault()
          insertImageFile(view, imageFile)
          return true
        }
        const html = cd.getData('text/html')
        const text = cd.getData('text/plain')
        if (html || !text || !looksLikeMarkdown(text)) return false
        try {
          const json = markdownToTiptap(text)
          const node = PMNode.fromJSON(view.state.schema, json)
          const slice = Slice.maxOpen(node.content)
          view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView())
          return true
        } catch {
          return false
        }
      },
      handleDrop: (view, event) => {
        const file = event.dataTransfer?.files?.[0]
        if (!file || !file.type.startsWith('image/')) return false
        event.preventDefault()
        insertImageFile(view, file)
        return true
      },
    },
  }, [docKey])

  // close/flush 用エフェクトが editor instance 再生成のたびに再登録されないよう、最新 editor を ref に写す
  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  // handleKeyDown が editor を作り直さずに最新コールバックを参照できるよう ref に写す
  useEffect(() => {
    onArrowUpRef.current = onArrowUpAtStart
  }, [onArrowUpAtStart])

  useImperativeHandle(ref, () => ({
    focusStart: () => editor?.commands.focus('start'),
  }), [editor])

  // 注: 同一ビュー内のドキュメント切替（Kura/Stash からのオープン）では、切替操作のクリックが
  // 先にエディタを blur させて onBlur フラッシュを enqueue し、openFile が書込キューに
  // 直列化されて「フラッシュ→active切替」の順序が保証されるため、退場ドキュメントの編集は失われない。
  useEffect(() => {
    return () => {
      // unmount 時: 保留中タイマーを破棄するだけでなく必ずフラッシュ
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
        const ed = editorRef.current
        if (ed && !ed.isDestroyed) {
          const md = tiptapToMarkdown(ed.getJSON())
          updateActiveContent(md).catch(() => {})
        }
      }
    }
  }, [updateActiveContent])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let cancelled = false
    async function register() {
      if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const win = getCurrentWindow()
      const handler = await win.onCloseRequested(async (event) => {
        const ed = editorRef.current
        if (!ed || ed.isDestroyed) return
        event.preventDefault()
        if (timerRef.current) {
          clearTimeout(timerRef.current)
          timerRef.current = null
        }
        const md = tiptapToMarkdown(ed.getJSON())
        try {
          await updateActiveContent(md)
        } finally {
          // 保存に失敗しても必ずウィンドウを閉じる（失敗は saveStatus/lastError に反映済み）
          await win.destroy()
        }
      })
      if (cancelled) handler()
      else unlisten = handler
    }
    void register()
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [updateActiveContent])

  return (
    <div className="w-full">
      <BubbleMenuBar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  )
})
