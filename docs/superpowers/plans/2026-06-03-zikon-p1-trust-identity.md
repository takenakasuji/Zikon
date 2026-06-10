# Zikon P1 — 信頼と同一性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 永続化状態とドキュメント同一性をユーザーに見えるようにし、暗黙のデータ挙動をなくす — 保存ステータス表示、第一級タイトル欄、下書きの可視化、安全な stash 復元、エラーの表面化。

**Architecture:** タイトルを本文の最初の H1 から分離し、エディタ本文上部の専用入力に。タイトルがファイル名の source of truth（衝突安全な write-then-delete で遅延リネーム）。本文編集ではリネームしない（churn 解消）。保存ステータスとエラーは store のフィールド＋軽量トーストで可視化。Kura に下書きを表示。

**Tech Stack:** React 19, TipTap 3, Zustand 5, Tauri 2, Tailwind 4, Vitest.

**前提:** P0 完了（mdast 双方向パイプライン、書込キュー直列化、autosave フラッシュ、`saveStatus`/`lastSavedAt`/`lastError` フィールド土台、衝突しない ID、Rust rename 衝突ガード）。`feat/ui-markdown-overhaul` ブランチで継続。

**注意（AGENTS.md）:** Next.js 16 はカスタム版。`'use client'`/レイアウト周りで疑問が出たら `node_modules/next/dist/docs/` の該当ガイドを必ず確認すること。

---

## File Structure

| File | 役割 |
|---|---|
| `src/store/toastStore.ts` (新規) | 軽量トースト用 Zustand store（push/dismiss、自動消滅） |
| `src/store/toastStore.test.ts` (新規) | トースト store のテスト |
| `src/components/ui/Toaster.tsx` (新規) | トースト表示コンポーネント（app レイアウトに常駐） |
| `src/store/workspaceStore.ts` (改修) | タイトル分離（`setActiveTitle`＋簡素化した`updateActiveContent`）、全書込経路で saveStatus 配線、エラー時トースト、drafts リスト、安全な stash 復元 |
| `src/store/workspaceStore.test.ts` (改修) | タイトル分離に合わせてテスト更新＋新規 |
| `src/types/index.ts` (改修) | `FileEntry` に `state?: DocState`（任意）を追加（Kura で下書き区別用） |
| `src/components/editor/DocTitle.tsx` (新規) | 本文上部の第一級タイトル入力 |
| `src/components/editor/SaveStatus.tsx` (新規) | Zen ヘッダの保存ステータス表示 |
| `src/app/(app)/zen/page.tsx` (改修) | DocTitle＋SaveStatus を配置 |
| `src/components/editor/NotionEditor.tsx` (改修) | H1 プレースホルダ結合を解除、docKey 変更時に退場ドキュメントをフラッシュ |
| `src/app/(app)/layout.tsx` (改修) | Toaster を常駐 |
| `src/app/(app)/kura/page.tsx` (改修) | 下書きセクション/状態バッジ表示、生ファイル名の露出をやめる |
| `src/app/page.tsx` (改修) | bootstrap のエラー区別（未設定 vs 読込失敗）＋リトライ |

---

## Task 1: トースト基盤（store + Toaster）

**Files:** Create `src/store/toastStore.ts`, `src/store/toastStore.test.ts`, `src/components/ui/Toaster.tsx`; Modify `src/app/(app)/layout.tsx`.

- [ ] **Step 1: 失敗するテストを書く** — `src/store/toastStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useToastStore } from './toastStore'

beforeEach(() => useToastStore.setState({ toasts: [] }))

describe('toastStore', () => {
  it('pushes a toast with an id and returns it', () => {
    const id = useToastStore.getState().push({ kind: 'error', message: 'boom' })
    const toasts = useToastStore.getState().toasts
    expect(toasts.length).toBe(1)
    expect(toasts[0].id).toBe(id)
    expect(toasts[0].kind).toBe('error')
    expect(toasts[0].message).toBe('boom')
  })

  it('dismisses a toast by id', () => {
    const id = useToastStore.getState().push({ kind: 'info', message: 'hi' })
    useToastStore.getState().dismiss(id)
    expect(useToastStore.getState().toasts.length).toBe(0)
  })
})
```

- [ ] **Step 2: 実行して失敗を確認** — `npx vitest run src/store/toastStore.test.ts` → FAIL（モジュール無し）

- [ ] **Step 3: 実装** — `src/store/toastStore.ts`:

```ts
'use client'
import { create } from 'zustand'

export type ToastKind = 'info' | 'success' | 'error'

export interface Toast {
  id: string
  kind: ToastKind
  message: string
}

interface ToastState {
  toasts: Toast[]
  push: (t: { kind: ToastKind; message: string; durationMs?: number }) => string
  dismiss: (id: string) => void
}

let counter = 0
function nextId(): string {
  counter += 1
  return `t${counter}`
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: ({ kind, message, durationMs = 4000 }) => {
    const id = nextId()
    set({ toasts: [...get().toasts, { id, kind, message }] })
    if (durationMs > 0 && typeof window !== 'undefined') {
      window.setTimeout(() => get().dismiss(id), durationMs)
    }
    return id
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}))
```

- [ ] **Step 4: 実行して成功** — `npx vitest run src/store/toastStore.test.ts` → PASS（2件）

- [ ] **Step 5: Toaster コンポーネント** — `src/components/ui/Toaster.tsx`:

```tsx
'use client'
import { useToastStore } from '@/store/toastStore'

const KIND_CLASS: Record<string, string> = {
  info: 'border-[var(--border)] text-[var(--foreground)]',
  success: 'border-[var(--primary)] text-[var(--foreground)]',
  error: 'border-red-500/60 text-red-300',
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  if (toasts.length === 0) return null
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto max-w-sm rounded-md border bg-[var(--muted)] px-4 py-2.5 text-left text-sm shadow-lg ${KIND_CLASS[t.kind] ?? KIND_CLASS.info}`}
        >
          {t.message}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 6: layout に常駐** — `src/app/(app)/layout.tsx` に Toaster を追加。`import { Toaster } from '@/components/ui/Toaster'` を足し、返却 JSX の最外 `<div>` 末尾（`</div>` 直前）に `<Toaster />` を置く:

```tsx
import { Sidebar } from '@/components/layout/Sidebar'
import { Toaster } from '@/components/ui/Toaster'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
      <Toaster />
    </div>
  )
}
```

- [ ] **Step 7: tsc & 全テスト** — `npx tsc --noEmit`（clean）、`npx vitest run`（全 PASS）

- [ ] **Step 8: コミット**

```bash
git add src/store/toastStore.ts src/store/toastStore.test.ts src/components/ui/Toaster.tsx "src/app/(app)/layout.tsx"
git commit -m "feat(ui): lightweight toast store + Toaster"
```

---

## Task 2: タイトル分離・saveStatus 全配線・エラートースト（store）

本文編集はリネームしない。タイトルは `setActiveTitle` が衝突安全な write-then-delete で変更。saveActive/stashActive にも saveStatus を配線し、失敗時はトースト。

**Files:** Modify `src/store/workspaceStore.ts`, `src/store/workspaceStore.test.ts`.

- [ ] **Step 1: テストを更新（失敗させる）** — `src/store/workspaceStore.test.ts`。既存の `describe('updateActiveContent', ...)` を以下に置換し、`describe('setActiveTitle', ...)` を新規追加。トースト store はモックする。ファイル冒頭のモック群の下に toast モックを追加:

```ts
vi.mock('@/store/toastStore', () => ({
  useToastStore: { getState: () => ({ push: vi.fn(), dismiss: vi.fn(), toasts: [] }) },
}))
```

`describe('updateActiveContent', ...)` を置換:

```ts
describe('updateActiveContent', () => {
  it('writes content to the current path WITHOUT renaming (title is decoupled)', async () => {
    await useWorkspaceStore.getState().updateActiveContent('# Hello body')
    expect(fs.writeDocument).toHaveBeenCalledWith('/ws', '.drafts/untitled_aaaaaa.md', '# Hello body')
    expect(fs.deleteDocument).not.toHaveBeenCalled()
    expect(useWorkspaceStore.getState().active?.title).toBe('')
  })

  it('serializes concurrent calls (no interleaving)', async () => {
    const order: string[] = []
    fs.writeDocument.mockImplementation(async (_ws: string, name: string) => {
      order.push('start:' + name)
      await new Promise((r) => setTimeout(r, 5))
      order.push('end:' + name)
    })
    const a = useWorkspaceStore.getState().updateActiveContent('a')
    const b = useWorkspaceStore.getState().updateActiveContent('b')
    await Promise.all([a, b])
    expect(order[0].startsWith('start:')).toBe(true)
    expect(order[1].startsWith('end:')).toBe(true)
  })
})

describe('setActiveTitle', () => {
  it('writes to the new title-derived path and removes the old file', async () => {
    useWorkspaceStore.setState({
      active: { name: 'untitled_aaaaaa.md', title: '', id: 'aaaaaa', content: 'body', state: 'draft' },
    })
    await useWorkspaceStore.getState().setActiveTitle('My Note')
    expect(fs.writeDocument).toHaveBeenCalledWith('/ws', '.drafts/My Note_aaaaaa.md', 'body')
    expect(fs.deleteDocument).toHaveBeenCalledWith('/ws', '.drafts/untitled_aaaaaa.md')
    expect(useWorkspaceStore.getState().active?.title).toBe('My Note')
    expect(useWorkspaceStore.getState().active?.name).toBe('My Note_aaaaaa.md')
  })

  it('is a no-op rename when the sanitized name is unchanged', async () => {
    useWorkspaceStore.setState({
      active: { name: 'Note_aaaaaa.md', title: 'Note', id: 'aaaaaa', content: 'b', state: 'draft' },
    })
    await useWorkspaceStore.getState().setActiveTitle('Note')
    expect(fs.deleteDocument).not.toHaveBeenCalled()
    expect(useWorkspaceStore.getState().active?.title).toBe('Note')
  })
})
```

(Remove the P0 "deletes the previous file across queued title edits" test — that behavior moved to setActiveTitle and is covered above.)

- [ ] **Step 2: 実行して失敗を確認** — `npx vitest run src/store/workspaceStore.test.ts` → FAIL

- [ ] **Step 3: 実装** — `src/store/workspaceStore.ts`。

(a) 先頭付近に import を追加: `import { useToastStore } from './toastStore'`。さらに小ヘルパ（enqueue の近く）:

```ts
function notifyError(message: string) {
  try {
    useToastStore.getState().push({ kind: 'error', message })
  } catch {
    // テスト等でトースト未初期化でも落とさない
  }
}
```

(b) `WorkspaceState` に `setActiveTitle: (title: string) => Promise<void>` を追加（型定義）。

(c) `updateActiveContent` を簡素化（タイトル導出・リネームを撤去）:

```ts
  updateActiveContent: async (content: string) => {
    return enqueue(async () => {
      const active = get().active
      const ws = get().workspace
      if (!active || !ws) return
      set({ saveStatus: 'saving' })
      try {
        await writeDocument(ws, pathFor(active), content)
        set({
          active: { ...active, content },
          saveStatus: 'saved',
          lastSavedAt: Date.now(),
          lastError: null,
        })
        if (active.state === 'saved') await get().reloadFiles()
      } catch (e) {
        set({ saveStatus: 'error', lastError: String(e) })
        notifyError('保存に失敗しました')
        throw e
      }
    })
  },
```

(d) `setActiveTitle` を新規追加（衝突安全な write-then-delete でリネーム）:

```ts
  setActiveTitle: async (title: string) => {
    return enqueue(async () => {
      const active = get().active
      const ws = get().workspace
      if (!active || !ws) return
      const newName = buildFilename(title, active.id)
      const oldPath = pathFor(active)
      const newPath = active.state === 'draft' ? `${DRAFTS_DIR}/${newName}` : newName
      if (newPath === oldPath) {
        set({ active: { ...active, title } })
        return
      }
      set({ saveStatus: 'saving' })
      try {
        await writeDocument(ws, newPath, active.content)
        try {
          await deleteDocument(ws, oldPath)
        } catch {
          // 旧ファイルが無い（本文未保存の新規draft）のは正常
        }
        set({
          active: { ...active, title, name: newName },
          saveStatus: 'saved',
          lastSavedAt: Date.now(),
          lastError: null,
        })
        if (active.state === 'saved') await get().reloadFiles()
      } catch (e) {
        set({ saveStatus: 'error', lastError: String(e) })
        notifyError('タイトルの保存に失敗しました')
        throw e
      }
    })
  },
```

(e) `saveActive` に saveStatus 配線＋失敗トースト（enqueue は維持）:

```ts
  saveActive: async () => {
    return enqueue(async () => {
      const ws = get().workspace
      const active = get().active
      if (!ws || !active) return
      set({ saveStatus: 'saving' })
      try {
        if (active.state === 'saved') {
          await writeDocument(ws, active.name, active.content)
        } else if (!isEmptyDoc(active)) {
          const draftPath = `${DRAFTS_DIR}/${active.name}`
          await writeDocument(ws, draftPath, active.content)
          await renameDocument(ws, draftPath, active.name)
          set({ active: { ...active, state: 'saved' } })
        }
        set({ saveStatus: 'saved', lastSavedAt: Date.now(), lastError: null })
        await get().reloadFiles()
      } catch (e) {
        set({ saveStatus: 'error', lastError: String(e) })
        notifyError('Kuraへの保存に失敗しました')
        throw e
      }
    })
  },
```

(f) `stashActive` に失敗トーストを追加（既存ロジック維持、try/catch で通知）:

```ts
  stashActive: async () => {
    return enqueue(async () => {
      const ws = get().workspace
      const active = get().active
      if (!ws || !active) return
      try {
        if (!isEmptyDoc(active)) {
          const srcPath = pathFor(active)
          const dstPath = `${STASH_DIR}/${active.name}`
          await writeDocument(ws, srcPath, active.content)
          await renameDocument(ws, srcPath, dstPath)
        } else {
          try {
            await deleteDocument(ws, pathFor(active))
          } catch {
            // まだ書かれていなければ無視
          }
        }
        set({ active: emptyDraft() })
        await get().reloadFiles()
        await get().reloadStashes()
      } catch (e) {
        set({ saveStatus: 'error', lastError: String(e) })
        notifyError('退避に失敗しました')
        throw e
      }
    })
  },
```

- [ ] **Step 4: 実行して成功** — `npx vitest run src/store/workspaceStore.test.ts` → PASS

- [ ] **Step 5: 全テスト & tsc** — `npx vitest run`、`npx tsc --noEmit`

- [ ] **Step 6: コミット**

```bash
git add src/store/workspaceStore.ts src/store/workspaceStore.test.ts
git commit -m "feat(store): decouple title from H1 (setActiveTitle), wire saveStatus + error toasts"
```

---

## Task 3: 第一級タイトル入力（DocTitle）

**Files:** Create `src/components/editor/DocTitle.tsx`; Modify `src/app/(app)/zen/page.tsx`, `src/components/editor/NotionEditor.tsx`.

- [ ] **Step 1: DocTitle コンポーネント** — `src/components/editor/DocTitle.tsx`:

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { useWorkspaceStore } from '@/store/workspaceStore'

const COMMIT_MS = 800

export function DocTitle({ docKey }: { docKey: string }) {
  const title = useWorkspaceStore((s) => s.active?.title ?? '')
  const setActiveTitle = useWorkspaceStore((s) => s.setActiveTitle)
  const [value, setValue] = useState(title)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ドキュメント切替時にローカル値を同期
  useEffect(() => {
    setValue(title)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey])

  const commit = (v: string) => {
    if (v !== title) void setActiveTitle(v)
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => {
        const v = e.target.value
        setValue(v)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => commit(v), COMMIT_MS)
      }}
      onBlur={() => {
        if (timer.current) {
          clearTimeout(timer.current)
          timer.current = null
        }
        commit(value)
      }}
      placeholder="無題"
      spellCheck={false}
      aria-label="ドキュメントのタイトル"
      className="mb-2 w-full border-none bg-transparent text-3xl font-bold text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)]"
    />
  )
}
```

- [ ] **Step 2: Zen に配置** — `src/app/(app)/zen/page.tsx` の `<main>` 内、`<NotionEditor ... />` の前に DocTitle を置く。import を追加し:

```tsx
import { DocTitle } from '@/components/editor/DocTitle'
// ...
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pt-4 pb-12">
        <DocTitle docKey={active.id} />
        <NotionEditor docKey={active.id} initialMarkdown={active.content} />
      </main>
```

- [ ] **Step 3: H1 プレースホルダ結合を解除** — `src/components/editor/NotionEditor.tsx` の Placeholder 設定を、見出し特別扱いをやめて本文用に統一:

```ts
      Placeholder.configure({
        placeholder: "「/」でコマンド、本文を書き始めてください",
      }),
```

(タイトルは DocTitle が担うため、heading 用の「無題のタイトル」プレースホルダは不要。)

- [ ] **Step 4: tsc & build & 全テスト** — `npx tsc --noEmit`、`npx vitest run`（回帰なし）、`npm run build`（成功すること）

- [ ] **Step 5: コミット**

```bash
git add src/components/editor/DocTitle.tsx "src/app/(app)/zen/page.tsx" src/components/editor/NotionEditor.tsx
git commit -m "feat(editor): first-class document title input above the body"
```

---

## Task 4: 保存ステータス表示（SaveStatus）

**Files:** Create `src/components/editor/SaveStatus.tsx`; Modify `src/app/(app)/zen/page.tsx`.

- [ ] **Step 1: SaveStatus コンポーネント** — `src/components/editor/SaveStatus.tsx`:

```tsx
'use client'
import { useWorkspaceStore } from '@/store/workspaceStore'

function formatTime(ms: number): string {
  const d = new Date(ms)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

export function SaveStatus() {
  const status = useWorkspaceStore((s) => s.saveStatus)
  const lastSavedAt = useWorkspaceStore((s) => s.lastSavedAt)
  const state = useWorkspaceStore((s) => s.active?.state)

  const stateLabel = state === 'saved' ? 'Kuraに保存済み' : '下書き'

  let saveLabel: string
  if (status === 'saving') saveLabel = '保存中…'
  else if (status === 'error') saveLabel = '保存失敗'
  else if (status === 'saved' && lastSavedAt) saveLabel = `保存しました ${formatTime(lastSavedAt)}`
  else saveLabel = ''

  const saveClass = status === 'error' ? 'text-red-400' : 'text-[var(--muted-foreground)]'

  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="rounded bg-[var(--muted)] px-2 py-0.5 text-[var(--muted-foreground)]">{stateLabel}</span>
      {saveLabel && <span className={saveClass}>{saveLabel}</span>}
    </div>
  )
}
```

- [ ] **Step 2: Zen ヘッダ左側に配置** — `src/app/(app)/zen/page.tsx` の `<header>` を `justify-between` にして左に SaveStatus、右に StashMenu:

```tsx
import { SaveStatus } from '@/components/editor/SaveStatus'
// ...
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--background)] px-6 py-2">
        <SaveStatus />
        <StashMenu />
      </header>
```

- [ ] **Step 3: tsc & build** — `npx tsc --noEmit`、`npm run build`

- [ ] **Step 4: コミット**

```bash
git add src/components/editor/SaveStatus.tsx "src/app/(app)/zen/page.tsx"
git commit -m "feat(zen): save-status + doc-state indicator in header"
```

---

## Task 5: Kura に下書きを表示

**Files:** Modify `src/types/index.ts`, `src/store/workspaceStore.ts`, `src/store/workspaceStore.test.ts`, `src/app/(app)/kura/page.tsx`.

- [ ] **Step 1: 型に state を追加** — `src/types/index.ts` の `FileEntry` に任意フィールドを追加:

```ts
export interface FileEntry {
  name: string
  title: string
  mtimeMs: number
  /** Kura 表示用の区別。drafts は 'draft'、root は 'saved'。 */
  state?: DocState
}
```

(`DocState` は同ファイルで既に定義済み。)

- [ ] **Step 2: store テストを追加（失敗させる）** — `src/store/workspaceStore.test.ts` に追記:

```ts
describe('reloadFiles + drafts', () => {
  it('exposes drafts separately and tags states', async () => {
    fs.listMarkdownFiles.mockResolvedValueOnce([{ name: 'Saved_aaaaaa.md', title: 'Saved', mtimeMs: 2 }])
    fs.listDraftFiles.mockResolvedValueOnce([{ name: 'Draft_bbbbbb.md', title: 'Draft', mtimeMs: 1 }])
    await useWorkspaceStore.getState().reloadFiles()
    expect(useWorkspaceStore.getState().files.map((f) => f.name)).toContain('Saved_aaaaaa.md')
    expect(useWorkspaceStore.getState().drafts.map((f) => f.name)).toContain('Draft_bbbbbb.md')
  })
})
```

- [ ] **Step 3: store に drafts を追加** — `src/store/workspaceStore.ts`:
  - `WorkspaceState` に `drafts: FileEntry[]` を追加、初期値 `drafts: []`。
  - `reloadFiles` を、root と drafts の両方を読み込むよう変更:

```ts
  reloadFiles: async () => {
    const ws = get().workspace
    if (!ws) return
    const [files, drafts] = await Promise.all([listMarkdownFiles(ws), listDraftFiles(ws)])
    set({
      files: files.map((f) => ({ ...f, state: 'saved' as const })),
      drafts: drafts.map((f) => ({ ...f, state: 'draft' as const })),
    })
  },
```

  - `listDraftFiles` が import 済みか確認（P0 で import 済み）。

- [ ] **Step 4: 実行して成功** — `npx vitest run src/store/workspaceStore.test.ts` → PASS

- [ ] **Step 5: Kura UI を更新** — `src/app/(app)/kura/page.tsx`:
  - `const drafts = useWorkspaceStore((s) => s.drafts)` を購読。
  - 下書きが存在する場合、保存済みリストの上に「下書き」セクションを表示。下書き行はクリックで `openDraft(name)` → `/zen`。
  - 各行の生ファイル名（`{f.name}`）表示を削除（タイトルと更新時刻のみ表示）。状態バッジ（下書き/保存済み）を小さく表示。
  - 空状態の判定は `files.length === 0 && drafts.length === 0`。

実装方針（既存の保存済みリスト `<ul>` をコンポーネント化して再利用）。`openDraft` は store に既存。下書き行のハンドラ:

```tsx
  const openDraftAndGo = async (name: string) => {
    await openDraft(name)
    router.push('/zen')
  }
```

生ファイル名行 `<div className="mt-0.5 truncate text-xs ...">{f.name}</div>` を削除し、代わりに状態バッジを追加:

```tsx
                <span className="mt-1 inline-block rounded bg-[var(--muted)] px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)]">
                  {f.state === 'draft' ? '下書き' : '保存済み'}
                </span>
```

- [ ] **Step 6: tsc & build & 全テスト** — `npx tsc --noEmit`、`npx vitest run`、`npm run build`

- [ ] **Step 7: コミット**

```bash
git add src/types/index.ts src/store/workspaceStore.ts src/store/workspaceStore.test.ts "src/app/(app)/kura/page.tsx"
git commit -m "feat(kura): surface drafts with state badges, hide raw filenames"
```

---

## Task 6: 安全な stash 復元 ＋ 切替フラッシュ

**Files:** Modify `src/components/editor/StashMenu.tsx`, `src/components/editor/NotionEditor.tsx`.

- [ ] **Step 1: 復元前フラッシュ＋トースト** — `src/components/editor/StashMenu.tsx` の `handleRestore` を、復元前に現在の active をフラッシュ（保存）し、復元後にトーストを出すよう変更:

```tsx
import { useToastStore } from '@/store/toastStore'
// ...
  const saveActive = useWorkspaceStore((s) => s.saveActive)
  const pushToast = useToastStore((s) => s.push)
// ...
  const handleRestore = async (s: FileEntry) => {
    if (!workspace) return
    // 現在の下書きを失わないよう先に保存（空なら no-op）
    await saveActive()
    await restoreStash(workspace, s.name)
    await reloadStashes()
    await openDraft(s.name)
    setOpen(false)
    pushToast({ kind: 'success', message: `「${s.title || '無題'}」を復元しました` })
  }
```

注: `saveActive` は空ドキュメントなら何もしない（isEmptyDoc ガード）。これにより「未保存の現ドキュメントが復元で消える」リスクを解消。

- [ ] **Step 2: docKey 変更時に退場ドキュメントをフラッシュ** — `src/components/editor/NotionEditor.tsx`。`docKey` を依存に持つ effect を追加し、`docKey` が変わる直前（cleanup）に保留中フラッシュを実行。P0 で `editorRef` と `timerRef` は既にある:

```ts
  useEffect(() => {
    return () => {
      // docKey 変更（同一ビュー内のドキュメント切替）時、退場ドキュメントの保留中編集をフラッシュ
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
        const ed = editorRef.current
        if (ed && !ed.isDestroyed) {
          void updateActiveContent(tiptapToMarkdown(ed.getJSON()))
        }
      }
    }
  }, [docKey, updateActiveContent])
```

注: P0 で追加した「P1 で明示的な切替フラッシュを追加予定」のコメントは、この effect の追加で解消される。コメントを「docKey 変更時にこの effect の cleanup がフラッシュする」に更新。

- [ ] **Step 3: tsc & build & 全テスト** — `npx tsc --noEmit`、`npx vitest run`、`npm run build`

- [ ] **Step 4: コミット**

```bash
git add src/components/editor/StashMenu.tsx src/components/editor/NotionEditor.tsx
git commit -m "fix(stash): flush current doc before restore + confirmation toast; flush on doc switch"
```

---

## Task 7: bootstrap のエラー区別とリトライ

**Files:** Modify `src/app/page.tsx`.

- [ ] **Step 1: 「未設定」と「読込失敗」を区別** — `src/app/page.tsx` を、保存済みワークスペースの読込が失敗した場合に /welcome へ飛ばさず、リトライ可能なエラー表示を出すよう変更。`return null` の代わりにブート/エラー表示:

```tsx
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
        <p className="text-sm text-red-400" role="alert">ワークスペースの読み込みに失敗しました</p>
        <p className="max-w-md text-center text-xs text-[var(--muted-foreground)]">{error}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void bootstrap()}
            className="rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--background)] hover:opacity-90"
          >
            再試行
          </button>
          <button
            type="button"
            onClick={() => router.replace('/welcome')}
            className="rounded px-4 py-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            別のフォルダを選ぶ
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] text-[var(--muted-foreground)]">
      <span className="text-sm">読み込み中…</span>
    </div>
  )
}
```

- [ ] **Step 2: tsc & build** — `npx tsc --noEmit`、`npm run build`

- [ ] **Step 3: コミット**

```bash
git add src/app/page.tsx
git commit -m "fix(boot): distinguish unconfigured vs read-failure with retry"
```

---

## Task 8: 統合検証

**Files:** なし（検証のみ）

- [ ] **Step 1: 全自動テスト** — `npx vitest run`（全 PASS）、`npx tsc --noEmit`（clean）、`npm run build`（成功）、`cd src-tauri && cargo test`（変更なしだが回帰確認）

- [ ] **Step 2: 手動検証（`npm run tauri:dev` / `/run` skill）**
1. タイトル欄にタイトルを入力 → 数秒後/blur でファイル名が変わる（Kura で確認）。本文を編集してもファイル名は変わらない。
2. 編集中にヘッダの「保存中…」→「保存しました HH:MM」が出る。状態バッジ「下書き/Kuraに保存済み」が正しい。
3. 下書きを作って /save せず Kura を見る → 「下書き」セクションに出る（生ファイル名は出ない）。
4. 何か書いた状態で Stash の項目を復元 → 現ドキュメントが失われず、「復元しました」トーストが出る。
5. fs 失敗を擬似（例: ワークスペースフォルダを一時的にリネーム）→ 保存失敗トースト＋「保存失敗」表示。
6. 存在するが読めないワークスペースでの起動 → welcome に飛ばず再試行 UI。

- [ ] **Step 3: ブランチ状態確認** — `git log --oneline main..HEAD | cat`。P1 のコミットが並ぶこと。完了後の整理は superpowers:finishing-a-development-branch に従う（P2 へ続く場合はそのまま）。

---

## Self-Review（spec §5 P1 充足チェック — 著者実施済み）

- **保存ステータスインジケータ**（保存中/保存しました/保存失敗）= Task 4 SaveStatus + Task 2 の saveStatus 全配線。✅
- **ドキュメントタイトル欄（H1 から分離）** = Task 3 DocTitle + Task 2 setActiveTitle（本文編集はリネームしない＝churn 解消も同時達成）。✅
- **draft/saved 状態バッジ** = Task 4（ヘッダ）＋ Task 5（Kura 行）。**Kura に下書きを表示** = Task 5。**生ファイル名の露出をやめる** = Task 5。✅
- **安全な stash 復元（復元前にフラッシュ／トースト）** = Task 6。✅
- **bootstrap/openFile のエラー区別とリトライ** = Task 7（bootstrap）。エラーの表面化（トースト）= Task 1 + Task 2。✅
- **P0 持ち越し: 同一ビュー内 docKey 切替フラッシュ** = Task 6 Step 2。✅

**スコープ外（P1では未実施・後続）**: テーマ付き confirm/prompt 置換（P4 A11y）、検索/コマンドパレット（P2）、画像 assets 化・MD貼付け（P2）、見た目ポリッシュ（P4）、外部変更 mtime 競合検知（後続）、編集可能テーブル（後続）。

**Type consistency**: 新 store action `setActiveTitle` をインターフェース・実装の両方に追加。`drafts: FileEntry[]` をインターフェース・初期値・`reloadFiles` で一貫。`FileEntry.state?` は任意フィールドで Rust 側 `RawFileEntry`（state を返さない）と非衝突（フロントで付与）。`useToastStore` は workspaceStore からは `getState().push` で呼び、テストではモック。
