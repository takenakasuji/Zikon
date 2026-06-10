# Zikon P3 — 検索 ＆ コマンドパレット Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** ノートが増えてもスケールする実用機能 — Kura の全文検索（タイトル＋本文）、`Cmd+K` コマンドパレット、`Cmd+S`/`Cmd+N`、可視の Save ボタン。

**Architecture:** 本文検索は Rust 側で root + .drafts の .md を走査（IPC 経由でファイルを大量に読まない）。タイトル表示はファイル名由来（P1 と一貫）。コマンドパレット＋グローバルショートカットは (app) レイアウトに常駐するクライアントコンポーネント。

**Tech Stack:** Rust (std::fs), Tauri 2, React 19, Next 16, Zustand 5, lucide-react, Vitest.

**前提:** P0–P2,P4 完了。`feat/ui-markdown-overhaul` で継続。store には `files`/`drafts`/`createNew`/`saveActive`/`stashActive`/`openFile`/`openDraft`/`clearWorkspace`、トースト `useToastStore`、確認 `useConfirmStore` あり。
**注意（AGENTS.md）:** Next 16 カスタム版。`'use client'` 周りは `node_modules/next/dist/docs/` を確認。

## スコープ外（明示）
- **本文内 `Cmd+F`（エディタ内検索/置換）** — 位置正確な ProseMirror 検索拡張が必要（実機検証も要る）。別途。
- 画像 assets、ハイライト、編集可能テーブル（既存デフォ）。

---

## File Structure
| File | 役割 |
|---|---|
| `src-tauri/src/workspace.rs` (改修) | `search_documents(ws, query)` ＋ `SearchHit` ＋ テスト |
| `src-tauri/src/commands.rs` (改修) | `ws_search` コマンド |
| `src-tauri/src/lib.rs` (改修) | ハンドラ登録 |
| `src/types/index.ts` (改修) | `SearchHit` 型 |
| `src/lib/fs/index.ts` (改修) | `searchDocuments(ws, query)` ラッパ（title はファイル名由来に） |
| `src/store/workspaceStore.ts` (改修) | `search(query)` アクション（結果は `FileEntry[]`、state付き） |
| `src/app/(app)/kura/page.tsx` (改修) | 検索ボックス（デバウンス、結果表示） |
| `src/components/editor/SaveButton.tsx` (新規) | Zen ヘッダの可視 Save |
| `src/app/(app)/zen/page.tsx` (改修) | SaveButton 設置 |
| `src/components/command/CommandPalette.tsx` (新規) | Cmd+K パレット ＋ Cmd+S/Cmd+N グローバル |
| `src/app/(app)/layout.tsx` (改修) | CommandPalette 常駐 |

---

## Task 1: Rust 全文検索 ＋ store

**Files:** `src-tauri/src/workspace.rs`, `commands.rs`, `lib.rs`, `src/types/index.ts`, `src/lib/fs/index.ts`, `src/store/workspaceStore.ts`.

- [ ] **Step 1: 失敗する Rust テスト** — `workspace.rs` の `mod tests` に追記:
```rust
    #[test]
    fn search_matches_title_and_body() {
        let dir = TempDir::new().unwrap();
        write_document(dir.path(), "Alpha_aaaaaa.md", "# Alpha\nthe quick brown fox").unwrap();
        write_document(dir.path(), "Beta_bbbbbb.md", "# Beta\nlazy dog").unwrap();
        std::fs::create_dir_all(dir.path().join(".drafts")).unwrap();
        std::fs::write(dir.path().join(".drafts/Draft_cccccc.md"), "# Draft\nfox in drafts").unwrap();

        // body match (root + drafts), case-insensitive
        let hits = search_documents(dir.path(), "FOX").unwrap();
        let names: Vec<_> = hits.iter().map(|h| h.name.as_str()).collect();
        assert!(names.contains(&"Alpha_aaaaaa.md"));
        assert!(names.contains(&"Draft_cccccc.md"));
        assert!(!names.contains(&"Beta_bbbbbb.md"));

        // filename/title match
        let hits2 = search_documents(dir.path(), "beta").unwrap();
        assert_eq!(hits2.len(), 1);
        assert_eq!(hits2[0].name, "Beta_bbbbbb.md");
        assert_eq!(hits2[0].state, "saved");

        // draft state tag
        let hits3 = search_documents(dir.path(), "drafts").unwrap();
        assert!(hits3.iter().any(|h| h.name == "Draft_cccccc.md" && h.state == "draft"));
    }
```
Run `cd src-tauri && cargo test search_matches_title_and_body` → FAIL.

- [ ] **Step 2: 実装** — `workspace.rs` に追加:
```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct SearchHit {
    pub name: String,
    pub mtime_ms: u128,
    pub state: String, // "saved" | "draft"
}

fn search_in(dir: &Path, state: &str, q: &str, skip_hidden: bool, out: &mut Vec<SearchHit>) -> Result<(), WsError> {
    if !dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() { continue; }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        if !name.ends_with(".md") { continue; }
        if skip_hidden && name.starts_with('.') { continue; }
        let content = fs::read_to_string(&path).unwrap_or_default();
        if name.to_lowercase().contains(q) || content.to_lowercase().contains(q) {
            let mtime_ms = entry.metadata()?.modified()?
                .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis();
            out.push(SearchHit { name, mtime_ms, state: state.to_string() });
        }
    }
    Ok(())
}

pub fn search_documents(workspace: &Path, query: &str) -> Result<Vec<SearchHit>, WsError> {
    if !workspace.exists() {
        return Err(WsError::NotFound);
    }
    let q = query.to_lowercase();
    let mut out = Vec::new();
    if q.trim().is_empty() {
        return Ok(out);
    }
    search_in(workspace, "saved", &q, true, &mut out)?;
    search_in(&workspace.join(DRAFTS_DIR), "draft", &q, false, &mut out)?;
    out.sort_by(|a, b| b.mtime_ms.cmp(&a.mtime_ms));
    Ok(out)
}
```
`commands.rs` に追加:
```rust
#[tauri::command]
pub fn ws_search(workspace: String, query: String) -> Result<Vec<crate::workspace::SearchHit>, String> {
    crate::workspace::search_documents(&PathBuf::from(&workspace), &query).map_err(|e| e.to_string())
}
```
（`commands.rs` の `use crate::workspace::{...}` に `search_documents`/`SearchHit` を足すか、上記のようにフルパスで参照。）
`lib.rs` の `invoke_handler![ ... ]` に `commands::ws_search,` を追加。

- [ ] **Step 3: `cargo test`** → PASS（全件）。

- [ ] **Step 4: 型 ＋ fs ラッパ ＋ store** —
  `src/types/index.ts` に:
```ts
export interface SearchHit {
  name: string
  mtimeMs: number
  state: DocState
}
```
  `src/lib/fs/index.ts` に（title はファイル名由来＝P1 と一貫）:
```ts
interface RawSearchHit { name: string; mtime_ms: number; state: string }

export async function searchDocuments(workspace: string, query: string): Promise<FileEntry[]> {
  const raw = await invoke<RawSearchHit[]>('ws_search', { workspace, query })
  return raw.map((r) => ({
    name: r.name,
    title: parseFilename(r.name)?.title ?? '',
    mtimeMs: r.mtime_ms,
    state: r.state === 'draft' ? 'draft' : 'saved',
  }))
}
```
  `src/store/workspaceStore.ts`: `searchDocuments` を `@/lib/fs` import に追加し、`WorkspaceState` に `search: (query: string) => Promise<FileEntry[]>` を追加、実装:
```ts
  search: async (query: string) => {
    const ws = get().workspace
    if (!ws || query.trim() === '') return []
    return searchDocuments(ws, query)
  },
```
（検索は読み取り専用なので enqueue 不要。）

- [ ] **Step 5: 検証 ＆ コミット** — `cargo test`、`npx tsc --noEmit`、`npx vitest run`、`npm run build`。
```bash
git add src-tauri/src/workspace.rs src-tauri/src/commands.rs src-tauri/src/lib.rs src/types/index.ts src/lib/fs/index.ts src/store/workspaceStore.ts
git commit -m "feat(search): rust full-text search (title+body) over root+drafts; store.search"
```

---

## Task 2: Kura 検索ボックス

**Files:** Modify `src/app/(app)/kura/page.tsx`.

- [ ] **Step 1: 検索 UI** — Kura に検索入力を追加。状態 `query` と `results: FileEntry[]`、`searching` を持ち、`query` をデバウンス（250ms）して `store.search(query)` を呼ぶ。`query.trim()` が空なら通常の `files`/`drafts` セクションを表示、非空なら検索結果（同じ Row コンポーネントで state バッジ付き、saved は `handleOpen`、draft は `handleOpenDraft`）を1リストで表示。0件なら「該当なし」。
  実装の要点（既存の Row/handlers を再利用）:
```tsx
  const search = useWorkspaceStore((s) => s.search)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FileEntry[]>([])
  useEffect(() => {
    if (query.trim() === '') { setResults([]); return }
    const id = setTimeout(async () => { setResults(await search(query)) }, 250)
    return () => clearTimeout(id)
  }, [query, search])
```
  ヘッダ下に検索 `<input>`（lucide `Search` アイコン付き、`placeholder="検索（タイトル・本文）"`、tokens 使用、focus はグローバル focus-visible に従う）。`query` が非空のときは `<section>` を1つにして `results.map(Row)`、空配列なら空状態（lucide `SearchX` + 「該当するドキュメントがありません」）。

- [ ] **Step 2: 検証 ＆ コミット** — `npx tsc --noEmit`、`npx vitest run`、`npm run build`。
```bash
git add "src/app/(app)/kura/page.tsx"
git commit -m "feat(kura): full-text search box (debounced) with state-tagged results"
```

---

## Task 3: 可視 Save ボタン ＋ グローバルショートカット ＋ コマンドパレット

**Files:** Create `src/components/editor/SaveButton.tsx`, `src/components/command/CommandPalette.tsx`; Modify `src/app/(app)/zen/page.tsx`, `src/app/(app)/layout.tsx`.

- [ ] **Step 1: SaveButton** — `src/components/editor/SaveButton.tsx`:
```tsx
'use client'
import { Save } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { useToastStore } from '@/store/toastStore'

export function SaveButton() {
  const saveActive = useWorkspaceStore((s) => s.saveActive)
  const state = useWorkspaceStore((s) => s.active?.state)
  const push = useToastStore((s) => s.push)
  const onSave = async () => {
    await saveActive()
    push({ kind: 'success', message: 'Kuraに保存しました' })
  }
  return (
    <button
      type="button"
      onClick={onSave}
      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--foreground)] hover:bg-[var(--accent)]"
      title="Kuraに保存 (⌘S)"
    >
      <Save size={14} aria-hidden="true" />
      <span>{state === 'saved' ? '保存' : 'Kuraに保存'}</span>
    </button>
  )
}
```
Zen ヘッダ（`zen/page.tsx`）の StashMenu の左隣に `<SaveButton />` を置く（右側グループ `<div className="flex items-center gap-1"><SaveButton /><StashMenu /></div>`）。

- [ ] **Step 2: CommandPalette（Cmd+K ＋ Cmd+S ＋ Cmd+N）** — `src/components/command/CommandPalette.tsx`。'use client'。グローバル keydown を1つ持ち:
  - `Cmd/Ctrl+K`: パレット開閉（preventDefault）
  - `Cmd/Ctrl+S`: `saveActive()` ＋ トースト（preventDefault）
  - `Cmd/Ctrl+N`: `createNew()` → `router.push('/zen')`（preventDefault）
  パレット UI（開いている時）: オーバーレイ＋入力＋コマンド一覧。コマンド = アクション群 ＋ ドキュメント（`files`+`drafts` を query でタイトル絞り込み、選択で open）。Arrow 上下、Enter 実行、Esc 閉。ConfirmDialog と同じ overlay/`role` パターン＋`animate-pop-in`。
  アクション: 新規作成 / Kuraに保存 / 退避 / Zenを開く / Kuraを開く / ワークスペース変更。実装:
```tsx
'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { useToastStore } from '@/store/toastStore'

interface Cmd { id: string; label: string; run: () => void | Promise<void> }

export function CommandPalette() {
  const router = useRouter()
  const store = useWorkspaceStore
  const push = useToastStore((s) => s.push)
  const files = useWorkspaceStore((s) => s.files)
  const drafts = useWorkspaceStore((s) => s.drafts)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((v) => !v); return }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void store.getState().saveActive().then(() => push({ kind: 'success', message: 'Kuraに保存しました' }))
        return
      }
      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        void store.getState().createNew().then(() => router.push('/zen'))
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router, push, store])

  useEffect(() => { if (open) { setQuery(''); setIndex(0); setTimeout(() => inputRef.current?.focus(), 0) } }, [open])

  const actions: Cmd[] = useMemo(() => {
    const s = store.getState()
    const go = (path: string) => () => { router.push(path); setOpen(false) }
    return [
      { id: 'new', label: '新規作成', run: async () => { await s.createNew(); router.push('/zen'); setOpen(false) } },
      { id: 'save', label: 'Kuraに保存', run: async () => { await s.saveActive(); push({ kind: 'success', message: 'Kuraに保存しました' }); setOpen(false) } },
      { id: 'stash', label: 'ドキュメントを退避', run: async () => { await s.stashActive(); setOpen(false) } },
      { id: 'zen', label: 'Zenを開く', run: go('/zen') },
      { id: 'kura', label: 'Kuraを開く', run: go('/kura') },
      { id: 'ws', label: 'ワークスペースを変更', run: async () => { await s.clearWorkspace(); router.replace('/welcome'); setOpen(false) } },
    ]
  }, [router, push, store])

  const items: Cmd[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    const docCmds: Cmd[] = [...drafts, ...files].map((f) => ({
      id: `doc:${f.state}:${f.name}`,
      label: `${f.title || '無題'}（${f.state === 'draft' ? '下書き' : '保存済み'}）`,
      run: async () => {
        if (f.state === 'draft') await store.getState().openDraft(f.name)
        else await store.getState().openFile(f.name)
        router.push('/zen')
        setOpen(false)
      },
    }))
    const all = [...actions, ...docCmds]
    if (!q) return all
    return all.filter((c) => c.label.toLowerCase().includes(q))
  }, [query, actions, files, drafts, router, store])

  useEffect(() => { setIndex(0) }, [query])

  if (!open) return null

  const run = (i: number) => { const c = items[i]; if (c) void c.run() }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-24"
      onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="コマンドパレット"
        className="animate-pop-in w-full max-w-lg overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--popover)] shadow-popover"
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
          <Search size={15} className="text-[var(--muted-foreground)]" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, items.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)) }
              else if (e.key === 'Enter') { e.preventDefault(); run(index) }
              else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
            }}
            placeholder="コマンド・ドキュメントを検索…"
            className="w-full bg-transparent text-sm text-[var(--foreground)] outline-none"
          />
        </div>
        <ul className="max-h-80 overflow-y-auto py-1">
          {items.length === 0 ? (
            <li className="px-3 py-3 text-center text-xs text-[var(--muted-foreground)]">該当なし</li>
          ) : (
            items.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => run(i)}
                  className={`block w-full px-3 py-2 text-left text-sm ${i === index ? 'bg-[var(--accent)] text-[var(--foreground)]' : 'text-[var(--foreground)] hover:bg-[var(--accent)]'}`}
                >
                  {c.label}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
```
`(app)/layout.tsx` に `<CommandPalette />` を常駐（Toaster/ConfirmDialog の隣）。

- [ ] **Step 3: 検証 ＆ コミット** — `npx tsc --noEmit`、`npx vitest run`、`npm run build`。
```bash
git add src/components/editor/SaveButton.tsx src/components/command/CommandPalette.tsx "src/app/(app)/zen/page.tsx" "src/app/(app)/layout.tsx"
git commit -m "feat(command): Cmd+K palette + Cmd+S/Cmd+N shortcuts + visible Save button"
```

---

## Task 4: 統合検証

- [ ] **Step 1: 全自動** — `npx vitest run`、`npx tsc --noEmit`、`npm run build`、`cd src-tauri && cargo test`（search テスト含む全PASS）。
- [ ] **Step 2: 手動（`npm run tauri:dev`）** — (1) Kura 検索: タイトル/本文で絞り込み、下書きも含む、state バッジ表示。(2) `Cmd+K` でパレット、アクション＆ドキュメント検索、Arrow/Enter/Esc。(3) `Cmd+S` 保存トースト、`Cmd+N` 新規→Zen。(4) Zen ヘッダの Save ボタンで保存。(5) パレットの「ワークスペース変更」で welcome へ。
- [ ] **Step 3: 完了** — `git log --oneline main..HEAD | cat`。整理は superpowers:finishing-a-development-branch。

---

## Self-Review（spec §5 P3 充足 — 著者実施済み）
- Kura 検索（タイトル＋本文）= Task 1（Rust）+ Task 2（UI）。✅
- `Cmd+K` コマンドパレット（新規/保存/退避/ビュー切替/ワークスペース/ドキュメントを開く）= Task 3。✅
- `Cmd+S`/`Cmd+N` = Task 3。✅
- 可視 Save ボタン = Task 3。✅
- 本文内 `Cmd+F` = **スコープ外**（ProseMirror 検索拡張が必要、別途）。

**Type consistency**: `SearchHit`（Rust `{name,mtime_ms,state}` → JS `FileEntry` に parseFilename でタイトル付与）。store `search(query): Promise<FileEntry[]>`（enqueue 不要・読み取り専用）。CommandPalette/SaveButton は client、layout に常駐。グローバル keydown は CommandPalette が一括管理（Cmd+K/S/N）。
