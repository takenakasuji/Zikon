# Zikon P2 — マークダウン入力体験 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** マークダウンの入力体験を best-in-class に。貼り付けたマークダウンが解釈され、リンク挿入がアプリ内ポップオーバーで完結し、スラッシュメニューが整理され、入力の摩擦をなくす。

**Architecture:** 既存の `markdownToTiptap` を貼り付け経路に接続。リンク編集は `window.prompt` をやめてバブルメニュー内のインライン入力に。スラッシュ項目をセクション分けし、コードブロック内では発火させない。

**Tech Stack:** React 19, TipTap 3 (`@tiptap/pm/model` for paste Slice), Zustand 5, Tailwind 4, Vitest.

**前提:** P0（mdast 双方向・RawBlock・書込安全）と P1（タイトル分離・保存ステータス・トースト・doc切替直列化）完了。`feat/ui-markdown-overhaul` で継続。トースト: `useToastStore().push`。

**注意（AGENTS.md）:** Next.js 16 はカスタム版。疑問が出たら `node_modules/next/dist/docs/` を確認。

## スコープ外（明示的に後続）
- **画像の assets/ フォルダ保存パイプライン**（base64 廃止）— Tauri の asset protocol / capability 設定と実機検証が必要なため別途。P2 では paste 対応 + サイズガードまで。
- **ハイライト（`==`）** — GFM に表現がなく、`==` の往復には remark 拡張が必要（underline と同じ無音消失リスク）。バブルメニューは可逆な操作（見出し化・書式クリア）のみ。
- アイコンの lucide 統一は P4（見た目）に集約。
- グローバル `Cmd+K`（コマンドパレット）は P3。

---

## File Structure

| File | 役割 |
|---|---|
| `src/lib/markdown/detect.ts` (新規) | `looksLikeMarkdown(text)` 判定（純粋関数・テスト可能） |
| `src/lib/markdown/detect.test.ts` (新規) | 判定テスト |
| `src/components/editor/NotionEditor.tsx` (改修) | autofocus 'end'、handlePaste（MD/画像）、handleDrop サイズガード共通化 |
| `src/app/globals.css` (改修) | 空ブロックのプレースホルダ表示 |
| `src/components/editor/BubbleMenuBar.tsx` (改修) | リンクポップオーバー化、見出し化・書式クリア追加、ショートカット表示 |
| `src/components/editor/slash/items.ts` (改修) | `group` 付与、説明の `\n` 除去 |
| `src/components/editor/slash/SlashMenu.tsx` (改修) | セクションヘッダ表示 |
| `src/components/editor/slash/SlashCommand.ts` (改修) | コードブロック内で `/` を抑制 |

---

## Task 1: 常時オートフォーカス ＋ 空ブロックのプレースホルダ

**Files:** Modify `src/components/editor/NotionEditor.tsx`, `src/app/globals.css`.

- [ ] **Step 1: autofocus** — `NotionEditor.tsx` の `useEditor` 設定で、非空ドキュメントも開いた瞬間に編集できるよう末尾フォーカスに:
```ts
    autofocus: initialMarkdown.trim() === '' ? 'start' : 'end',
```
(現状 `: false` を `: 'end'` に変更。)

- [ ] **Step 2: 空ブロックプレースホルダ** — Placeholder 設定に `showOnlyCurrent: true` を明示（カーソル位置の空ブロックのみ表示）:
```ts
      Placeholder.configure({
        placeholder: "「/」でコマンド、本文を書き始めてください",
        showOnlyCurrent: true,
      }),
```
`src/app/globals.css` の既存 `.ProseMirror p.is-editor-empty:first-child::before { ... }` ルールの直後に、カーソル位置の空段落にもプレースホルダを出すルールを追加（既存ルールはそのまま残す）:
```css
.ProseMirror p.is-empty.has-focus::before {
  content: attr(data-placeholder);
  color: var(--muted-foreground);
  pointer-events: none;
  float: left;
  height: 0;
}
```
(注: Placeholder 拡張は空ノードに `is-empty` を、フォーカス中ノードに `has-focus` を付与する。両方揃う＝カーソルがある空段落のみ表示。)

- [ ] **Step 3: 検証** — `npx tsc --noEmit`、`npx vitest run`（回帰なし）、`npm run build`。

- [ ] **Step 4: コミット**
```bash
git add src/components/editor/NotionEditor.tsx src/app/globals.css
git commit -m "feat(editor): always autofocus to end; per-block placeholder on focused empty line"
```

---

## Task 2: 貼り付けの解釈（マークダウン ＋ 画像）

**Files:** Create `src/lib/markdown/detect.ts`, `src/lib/markdown/detect.test.ts`; Modify `src/components/editor/NotionEditor.tsx`.

- [ ] **Step 1: 失敗するテスト** — `src/lib/markdown/detect.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { looksLikeMarkdown } from './detect'

describe('looksLikeMarkdown', () => {
  it('detects block markers', () => {
    expect(looksLikeMarkdown('# Heading')).toBe(true)
    expect(looksLikeMarkdown('- item\n- item2')).toBe(true)
    expect(looksLikeMarkdown('1. one')).toBe(true)
    expect(looksLikeMarkdown('> quote')).toBe(true)
    expect(looksLikeMarkdown('```ts\ncode\n```')).toBe(true)
    expect(looksLikeMarkdown('| A | B |\n| - | - |')).toBe(true)
  })
  it('detects inline markers', () => {
    expect(looksLikeMarkdown('see [text](https://e.com)')).toBe(true)
    expect(looksLikeMarkdown('this is **bold**')).toBe(true)
    expect(looksLikeMarkdown('use `code` here')).toBe(true)
    expect(looksLikeMarkdown('~~strike~~')).toBe(true)
  })
  it('returns false for plain text and bare URLs', () => {
    expect(looksLikeMarkdown('just a sentence')).toBe(false)
    expect(looksLikeMarkdown('https://example.com')).toBe(false)
    expect(looksLikeMarkdown('a single word')).toBe(false)
  })
})
```

- [ ] **Step 2: 実行して失敗確認** — `npx vitest run src/lib/markdown/detect.test.ts` → FAIL。

- [ ] **Step 3: 実装** — `src/lib/markdown/detect.ts`:
```ts
const BLOCK = /(^|\n)\s{0,3}(#{1,6} |[-*+] |\d+\. |> |```|\|.*\|)/
const INLINE = /\[[^\]\n]+\]\([^)\n]*\)|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|`[^`\n]+`/

/** プレーンテキスト貼り付けをマークダウンとして解釈すべきか（素の文章/URLは除外）。 */
export function looksLikeMarkdown(text: string): boolean {
  return BLOCK.test(text) || INLINE.test(text)
}
```

- [ ] **Step 4: 実行して成功** — `npx vitest run src/lib/markdown/detect.test.ts` → PASS。

- [ ] **Step 5: handlePaste / handleDrop を実装** — `NotionEditor.tsx`。imports を追加:
```ts
import { Node as PMNode, Slice } from '@tiptap/pm/model'
import { markdownToTiptap } from '@/lib/markdown/fromMarkdown'
import { looksLikeMarkdown } from '@/lib/markdown/detect'
import { useToastStore } from '@/store/toastStore'
```
`NotionEditor` 関数内（既存の `updateActiveContent` 取得の近く）で toast を取得:
```ts
  const pushToast = useToastStore((s) => s.push)
```
`MAX_IMAGE_BYTES` 定数を `AUTO_SAVE_MS` の近くに追加:
```ts
const MAX_IMAGE_BYTES = 2 * 1024 * 1024 // 2MB
```
`editorProps` 内に画像挿入の共通関数を使う `handlePaste` を追加し、既存 `handleDrop` をサイズガード付きに更新。`editorProps` を次の形に:
```ts
    editorProps: {
      attributes: {
        class: 'ProseMirror',
        spellcheck: 'false',
        autocorrect: 'off',
        autocapitalize: 'off',
        autocomplete: 'off',
      },
      handlePaste: (view, event) => {
        const cd = event.clipboardData
        if (!cd) return false
        // 1) 画像ファイルの貼り付け
        const imageFile = Array.from(cd.files).find((f) => f.type.startsWith('image/'))
        if (imageFile) {
          event.preventDefault()
          insertImageFile(view, imageFile)
          return true
        }
        // 2) マークダウンテキストの貼り付け（HTML がある場合は既定の処理に任せる）
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
```
そして `NotionEditor` 関数のスコープ内（return の前）に画像挿入ヘルパを定義。これは `pushToast` を参照するためコンポーネント内に置く:
```ts
  const insertImageFile = (view: import('@tiptap/pm/view').EditorView, file: File) => {
    if (file.size > MAX_IMAGE_BYTES) {
      pushToast({ kind: 'error', message: '画像が大きすぎます（2MBまで）' })
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const src = reader.result as string
      const { schema } = view.state
      const node = schema.nodes.image.create({ src })
      view.dispatch(view.state.tr.replaceSelectionWith(node))
    }
    reader.onerror = () => pushToast({ kind: 'error', message: '画像の読み込みに失敗しました' })
    reader.readAsDataURL(file)
  }
```
注: `insertImageFile` は `editorProps` から参照されるため、`useEditor` 呼び出しより前に宣言する（関数宣言の巻き上げが効くよう `function insertImageFile(...) {}` でも可。`pushToast` を使うので、`useEditor` の前に `const insertImageFile = ...` を定義し、`editorProps` のクロージャから参照する形にする）。順序に注意。

- [ ] **Step 6: 検証** — `npx tsc --noEmit`、`npx vitest run`、`npm run build`。手動補足（任意）: `# 見出し\n- a\n- b` をコピーして貼り付け→ブロックに解釈される。素の文章を貼り付け→そのまま。

- [ ] **Step 7: コミット**
```bash
git add src/lib/markdown/detect.ts src/lib/markdown/detect.test.ts src/components/editor/NotionEditor.tsx
git commit -m "feat(editor): parse pasted markdown into blocks; paste images with size guard"
```

---

## Task 3: リンクポップオーバー（window.prompt 置換）

`window.prompt` をやめ、バブルメニュー内のインライン URL 入力に。URL 正規化・解除ボタン・Esc キャンセル。

**Files:** Modify `src/components/editor/BubbleMenuBar.tsx`.

- [ ] **Step 1: 実装** — `src/components/editor/BubbleMenuBar.tsx` を、リンク編集モードを持つ形に改修。READ してから。`useState`/`useRef`/`useEffect` を使う。要点:
  - ローカル状態 `linkEditing: boolean` と `linkUrl: string`。
  - リンクボタンクリックで `linkEditing=true`、現在の href を prefill（`editor.getAttributes('link').href`）。
  - 編集モード時はバブルメニュー内に `<input type="url">` ＋「適用」「解除」ボタンを表示（書式ボタン群の代わり）。
  - URL 正規化: 入力が空なら unset、`http(s)://` も `mailto:` も付いていなければ `https://` を前置。
  - Enter で適用、Esc で `linkEditing=false`、入力に autoFocus。

実装（全置換）:
```tsx
'use client'
import { BubbleMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'

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
    `px-2 py-1 text-sm rounded transition-colors ${
      active
        ? 'bg-[var(--accent)] text-[var(--primary)]'
        : 'text-[var(--foreground)] hover:bg-[var(--accent)]'
    }`

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: 'top' }}
      className="flex items-center gap-0.5 rounded-md border border-[var(--border)] bg-[var(--background)] px-1 py-0.5 shadow-lg"
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
          <button type="button" onClick={applyLink} className={btn(false)} title="適用">適用</button>
          <button type="button" onClick={removeLink} className={btn(false)} title="リンク解除">解除</button>
        </div>
      ) : (
        <>
          <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={btn(editor.isActive('heading', { level: 1 }))} title="見出し1">H1</button>
          <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(editor.isActive('heading', { level: 2 }))} title="見出し2">H2</button>
          <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btn(editor.isActive('heading', { level: 3 }))} title="見出し3">H3</button>
          <span className="mx-0.5 h-4 w-px bg-[var(--border)]" />
          <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive('bold'))} title="太字 (⌘B)"><strong>B</strong></button>
          <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive('italic'))} title="斜体 (⌘I)"><em>I</em></button>
          <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={btn(editor.isActive('strike'))} title="取り消し線 (⌘⇧S)"><s>S</s></button>
          <button type="button" onClick={() => editor.chain().focus().toggleCode().run()} className={btn(editor.isActive('code'))} title="インラインコード (⌘E)"><span className="font-mono text-xs">{'<>'}</span></button>
          <span className="mx-0.5 h-4 w-px bg-[var(--border)]" />
          <button type="button" onClick={startLinkEdit} className={btn(editor.isActive('link'))} title="リンク">リンク</button>
          <button type="button" onClick={() => editor.chain().focus().unsetAllMarks().run()} className={btn(false)} title="書式をクリア">クリア</button>
        </>
      )}
    </BubbleMenu>
  )
}
```

- [ ] **Step 2: 検証** — `npx tsc --noEmit`、`npx vitest run`、`npm run build`。型注意: `setLink`/`toggleHeading`/`unsetAllMarks` は導入済み拡張（Link, StarterKit）のコマンド。

- [ ] **Step 3: コミット**
```bash
git add src/components/editor/BubbleMenuBar.tsx
git commit -m "feat(editor): inline link popover (replaces window.prompt); heading/clear-format in bubble menu"
```

---

## Task 4: スラッシュメニュー整理（セクション ＋ コードブロック抑制）

**Files:** Modify `src/components/editor/slash/items.ts`, `src/components/editor/slash/SlashMenu.tsx`, `src/components/editor/slash/SlashCommand.ts`.

- [ ] **Step 1: items に group を付与** — `src/components/editor/slash/items.ts`。`SlashItem` インターフェースに `group: string` を追加し、各項目に付与。説明の literal `\n` を 1 行に直す。グループ:
  - 'テキスト'/'見出し 1-3' → `group: '基本ブロック'`
  - '箇条書きリスト'/'番号付きリスト'/'チェックリスト' → `group: 'リスト'`
  - '引用'/'コードブロック'/'区切り線' → `group: '挿入'`
  - 'Kuraへ保存'/'ドキュメントを退避' → `group: 'アクション'`

  例（説明の `\n` 除去）:
```ts
  {
    title: '箇条書きリスト',
    description: '・項目の一覧',
    searchTerms: ['bullet', 'list', 'ul', '箇条書き', 'リスト'],
    icon: '•',
    group: 'リスト',
    command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).toggleBulletList().run() },
  },
  {
    title: '番号付きリスト',
    description: '1. 連番の一覧',
    searchTerms: ['ordered', 'numbered', 'list', 'ol', '番号', 'リスト'],
    icon: '1.',
    group: 'リスト',
    command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).toggleOrderedList().run() },
  },
```
  他の全項目にも `group` を付与（上記マッピングに従う）。`filterSlashItems` は順序維持なので変更不要。`SlashItem` 型に `group: string` を必須追加。

- [ ] **Step 2: SlashMenu にセクションヘッダ** — `src/components/editor/slash/SlashMenu.tsx`。アイテム一覧をレンダリングする際、直前アイテムと `group` が変わったらヘッダ行を差し込む。`items.map` の中で実装:
```tsx
      {items.map((item, index) => {
        const showHeader = index === 0 || items[index - 1].group !== item.group
        return (
          <div key={item.title}>
            {showHeader && (
              <div className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                {item.group}
              </div>
            )}
            <button
              ref={(el) => { itemRefs.current[index] = el }}
              type="button"
              onClick={() => select(index)}
              onMouseEnter={() => { if (!kbdNav) setSelectedIndex(index) }}
              className={`flex w-full items-start gap-3 rounded px-2 py-1.5 text-left transition-colors ${
                index === selectedIndex ? 'bg-[var(--accent)]' : kbdNav ? '' : 'hover:bg-[var(--accent)]'
              }`}
            >
              <span className="mt-0.5 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded border border-[var(--border)] bg-[var(--muted)] text-xs font-mono text-[var(--foreground)]">
                {item.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-[var(--foreground)]">{item.title}</span>
                <span className="block truncate text-xs text-[var(--muted-foreground)]">{item.description}</span>
              </span>
            </button>
          </div>
        )
      })}
```
(注: `itemRefs`/`selectedIndex`/`kbdNav`/`select` は既存のまま。`index` ベースのキーボードナビは維持される — ヘッダは `<div>` ラッパ内なので `itemRefs.current[index]` のボタン参照と scrollIntoView は引き続き機能する。)

- [ ] **Step 3: コードブロック内で抑制** — `src/components/editor/slash/SlashCommand.ts` の `suggestion` 設定に `allow` を追加:
```ts
      suggestion: {
        char: '/',
        startOfLine: false,
        allow: ({ editor }: { editor: import('@tiptap/react').Editor }) => !editor.isActive('codeBlock'),
        command: (...) // 既存のまま
      },
```

- [ ] **Step 4: 検証** — `npx tsc --noEmit`、`npx vitest run`、`npm run build`。

- [ ] **Step 5: コミット**
```bash
git add src/components/editor/slash/items.ts src/components/editor/slash/SlashMenu.tsx src/components/editor/slash/SlashCommand.ts
git commit -m "feat(slash): group items into sections; suppress '/' inside code blocks"
```

---

## Task 5: 統合検証

**Files:** なし（検証のみ）

- [ ] **Step 1: 全自動テスト** — `npx vitest run`（全 PASS）、`npx tsc --noEmit`（clean）、`npm run build`（成功）、`cd src-tauri && cargo test`（回帰確認）。

- [ ] **Step 2: 手動検証（`npm run tauri:dev` / `/run`）**
1. マークダウン（`# 見出し`/リスト/`**bold**`）をコピーして本文に貼り付け → ブロック/書式に解釈される。素の文章はそのまま。
2. 画像をペースト → 挿入される。2MB超 → トースト警告。
3. テキストを選択しバブルメニューの「リンク」 → インライン入力が出る。`example.com` 入力 → `https://example.com` にリンク。「解除」で外れる。`window.prompt` は出ない。
4. 選択して H1/H2/H3 で見出し化、「クリア」で書式が外れる。
5. `/` メニューがセクション分け表示（基本ブロック/リスト/挿入/アクション）。コードブロック内で `/` を打っても出ない。
6. 既存ドキュメントを開いた瞬間に末尾にカーソルがあり即入力できる。空行で `/` ヒントが出る。

- [ ] **Step 3: ブランチ状態** — `git log --oneline main..HEAD | cat`。完了後の整理は superpowers:finishing-a-development-branch。

---

## Self-Review（spec §5 P2 充足チェック — 著者実施済み）
- **MD 貼付けの解釈** = Task 2（handlePaste + looksLikeMarkdown）。✅
- **リンクポップオーバー（window.prompt 置換・URL正規化・選択保持・解除）** = Task 3。✅
- **スラッシュ整理（区分け・コードブロック内抑制）** = Task 4。✅
- **バブルメニュー拡充（見出し化・クリア書式）＋ショートカット表示** = Task 3（ハイライトはスコープ外）。✅
- **常時オートフォーカス・ブロック別プレースホルダ** = Task 1。✅
- **画像（paste 対応・サイズガード）** = Task 2（assets化はスコープ外）。✅
- **StarterKit link/underline 重複解消** = P0 で完了済み。✅

**スコープ外（明示）**: 画像 assets/ パイプライン、ハイライト `==`、lucide アイコン統一（P4）、グローバル Cmd+K（P3）。

**Type consistency**: `SlashItem.group: string` を型・全項目に追加。`looksLikeMarkdown` は純粋関数。handlePaste/handleDrop は共通 `insertImageFile` を使用（`pushToast` 参照のためコンポーネント内定義、`useEditor` 設定より前に宣言）。`@tiptap/pm/model` の `Node.fromJSON`/`Slice.maxOpen` を使用。
