# Local-First `.md` Files — 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ドキュメントの永続化先を localStorage から Tauri デスクトップアプリ上のユーザー指定フォルダ内 `.md` ファイルへ移行する。

**Architecture:** Next.js (静的書き出し) をフロントエンドに、Tauri 2 (Rust) をシェルにし、ワークスペース内に `{H1}_{ID}.md` 形式でドキュメントを保存する。Stash は `.stash/` サブフォルダへの `fs::rename` で実現。エディタは H1=タイトルのモデルに変更し、debounceでファイル名追従リネームを行う。

**Tech Stack:** Tauri 2, Rust (notify は使わない), Next.js 16 (`output: 'export'`), Tiptap, Zustand, unified/remark-parse (markdown→Tiptap逆変換), Vitest (TS tests), cargo test (Rust tests)

**Spec:** `docs/superpowers/specs/2026-05-13-local-first-md-files-design.md`

---

## ファイル構成

### 新規ディレクトリ
```
src-tauri/                       Tauri 2 プロジェクト一式
├── Cargo.toml
├── tauri.conf.json
├── build.rs
└── src/
    ├── main.rs                  Tauri アプリのエントリ
    ├── commands.rs              Tauri commands（フロント呼び出し用）
    ├── workspace.rs             FS 操作実装
    ├── path_safety.rs           ワークスペース外アクセスの拒否
    └── tests.rs                 cargo test
```

### 新規 TS モジュール
- `src/lib/fs/index.ts` — Tauri invoke ラッパー
- `src/lib/fs/filename.ts` — ファイル名生成・サニタイズ・IDgen
- `src/lib/markdown/fromMarkdown.ts` — MD → Tiptap JSON 変換
- `src/store/workspaceStore.ts` — workspace 状態
- `src/app/welcome/page.tsx` — フォルダ選択画面
- `src/components/welcome/WelcomeScreen.tsx` — ウェルカム UI

### 既存ファイルへの変更
- `next.config.ts` — `output: 'export'`
- `src/app/page.tsx` — Server redirect → クライアントサイドリダイレクト
- `src/app/(app)/zen/page.tsx` — タイトル入力欄削除、ファイルベース保存
- `src/app/(app)/kura/page.tsx` — プレースホルダ → ファイル一覧本実装
- `src/components/editor/NotionEditor.tsx` — onUpdate でファイル書き込み、H1抽出
- `src/components/editor/slash/items.ts` — `/stash` を `fs::rename` ベースに
- `src/components/editor/StashMenu.tsx` — Stash ファイルから一覧
- `src/components/layout/Sidebar.tsx` — 「ワークスペースを変更」リンク追加
- `src/store/editorStore.ts` — 縮小（document, stashes を削除）
- `src/types/index.ts` — Document 型を再定義（path フィールド追加）
- `src/lib/storage/localStorage.ts` — 削除
- `package.json` — Tauri / Vitest 関連 deps 追加

---

## Task 1: Tauri 2 プロジェクト初期化

**Files:**
- Create: `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/build.rs`, `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`
- Modify: `package.json`, `next.config.ts`, `src/app/page.tsx`

- [ ] **Step 1: Tauri CLI と API をインストール**

```bash
npm install -D @tauri-apps/cli@^2
npm install @tauri-apps/api@^2 @tauri-apps/plugin-dialog@^2 @tauri-apps/plugin-fs@^2 @tauri-apps/plugin-store@^2
```

- [ ] **Step 2: Tauri プロジェクトを scaffold**

```bash
npx tauri init --ci --app-name "Zikon" --window-title "Zikon" --frontend-dist "../out" --dev-url "http://localhost:3000" --before-dev-command "npm run dev" --before-build-command "npm run build"
```

Expected: `src-tauri/` ディレクトリが作成され、`Cargo.toml`, `tauri.conf.json`, `src/main.rs` が生成される。

- [ ] **Step 3: Next.js を静的書き出しに切替**

`next.config.ts` を以下に置き換える：

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
```

- [ ] **Step 4: ルート `/` をクライアントリダイレクトに変更**

`src/app/page.tsx` を以下に置き換える（静的書き出しでは Server `redirect()` が動かないため）：

```tsx
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function RootPage() {
  const router = useRouter()
  useEffect(() => { router.replace('/zen') }, [router])
  return null
}
```

- [ ] **Step 5: Tauri 設定でプラグインを有効化**

`src-tauri/tauri.conf.json` の `plugins` セクションに dialog, fs, store を追加。`src-tauri/Cargo.toml` の `[dependencies]` に `tauri-plugin-dialog = "2"`, `tauri-plugin-fs = "2"`, `tauri-plugin-store = "2"` を追加。

`src-tauri/src/lib.rs` を以下に置き換える：

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

`src-tauri/src/main.rs` :

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    zikon_lib::run();
}
```

`Cargo.toml` の `[lib]` セクションに `name = "zikon_lib"` を設定。

- [ ] **Step 6: `package.json` のスクリプトに tauri を追加**

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "tauri": "tauri",
  "tauri:dev": "tauri dev",
  "tauri:build": "tauri build"
}
```

- [ ] **Step 7: Tauri dev 起動確認**

```bash
npm run tauri:dev
```

Expected: Tauri のウィンドウが立ち上がり、Next.js のページが表示される。`/zen` に遷移し既存のエディタが表示される。確認できたらCtrl+Cで停止。

- [ ] **Step 8: コミット**

```bash
git add -A
git commit -m "feat: bootstrap Tauri 2 desktop shell with static Next.js export"
```

---

## Task 2: Vitest セットアップとファイル名ユーティリティ（TDD）

**Files:**
- Create: `vitest.config.ts`, `src/lib/fs/filename.ts`, `src/lib/fs/filename.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Vitest と関連 deps をインストール**

```bash
npm install -D vitest @vitest/ui jsdom
```

- [ ] **Step 2: `vitest.config.ts` を作成**

```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 3: `package.json` に test スクリプト追加**

```json
"scripts": {
  ...,
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 4: ファイル名ユーティリティのテストを書く（失敗確認）**

`src/lib/fs/filename.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { generateId, sanitizeTitle, buildFilename, parseFilename, extractFirstH1 } from './filename'

describe('generateId', () => {
  it('returns a 6-char base36 string', () => {
    const id = generateId()
    expect(id).toMatch(/^[0-9a-z]{6}$/)
  })

  it('returns different ids on subsequent calls', () => {
    const a = generateId()
    const b = generateId()
    expect(a).not.toBe(b)
  })
})

describe('sanitizeTitle', () => {
  it('replaces filesystem-forbidden chars with underscore', () => {
    expect(sanitizeTitle('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j')
  })

  it('replaces newlines and tabs with underscore', () => {
    expect(sanitizeTitle('foo\nbar\tbaz')).toBe('foo_bar_baz')
  })

  it('truncates titles longer than 40 chars', () => {
    const long = 'あ'.repeat(60)
    expect(sanitizeTitle(long).length).toBe(40)
  })

  it('returns empty string for empty input', () => {
    expect(sanitizeTitle('')).toBe('')
  })

  it('trims trailing whitespace', () => {
    expect(sanitizeTitle('  hello  ')).toBe('hello')
  })
})

describe('buildFilename', () => {
  it('combines title and id with underscore', () => {
    expect(buildFilename('設計メモ', 'abc123')).toBe('設計メモ_abc123.md')
  })

  it('uses "untitled" when title is empty', () => {
    expect(buildFilename('', 'abc123')).toBe('untitled_abc123.md')
  })

  it('sanitizes the title portion', () => {
    expect(buildFilename('a/b', 'abc123')).toBe('a_b_abc123.md')
  })
})

describe('parseFilename', () => {
  it('extracts id from end of filename', () => {
    expect(parseFilename('設計メモ_abc123.md')).toEqual({ title: '設計メモ', id: 'abc123' })
  })

  it('handles untitled', () => {
    expect(parseFilename('untitled_xyz789.md')).toEqual({ title: '', id: 'xyz789' })
  })

  it('returns null for non-conforming filenames', () => {
    expect(parseFilename('readme.md')).toBeNull()
    expect(parseFilename('not-markdown.txt')).toBeNull()
  })
})

describe('extractFirstH1', () => {
  it('returns the first H1 heading', () => {
    expect(extractFirstH1('# Hello\n\n## sub\n# Second')).toBe('Hello')
  })

  it('ignores headings deeper than H1', () => {
    expect(extractFirstH1('## sub\n# top')).toBe('top')
  })

  it('returns empty string when no H1 exists', () => {
    expect(extractFirstH1('plain text\n## sub')).toBe('')
  })

  it('trims whitespace', () => {
    expect(extractFirstH1('#   Spaced   ')).toBe('Spaced')
  })
})
```

- [ ] **Step 5: テストを実行してすべて失敗することを確認**

```bash
npm test
```

Expected: モジュール未定義によりすべて FAIL する。

- [ ] **Step 6: `src/lib/fs/filename.ts` を実装**

```ts
const FORBIDDEN = /[\/\\:*?"<>|\n\t\r]/g
const MAX_TITLE_LEN = 40

export function generateId(): string {
  const base36 = (Date.now() + Math.floor(Math.random() * 1000)).toString(36)
  return base36.slice(-6).padStart(6, '0')
}

export function sanitizeTitle(title: string): string {
  const cleaned = title.replace(FORBIDDEN, '_').trim()
  return cleaned.length > MAX_TITLE_LEN ? cleaned.slice(0, MAX_TITLE_LEN) : cleaned
}

export function buildFilename(title: string, id: string): string {
  const safe = sanitizeTitle(title)
  const head = safe || 'untitled'
  return `${head}_${id}.md`
}

export function parseFilename(filename: string): { title: string; id: string } | null {
  const m = filename.match(/^(.*?)_([0-9a-z]{6})\.md$/)
  if (!m) return null
  const title = m[1] === 'untitled' ? '' : m[1]
  return { title, id: m[2] }
}

export function extractFirstH1(markdown: string): string {
  const match = markdown.match(/^# (.+)$/m)
  return match ? match[1].trim() : ''
}
```

- [ ] **Step 7: テストが全て通ることを確認**

```bash
npm test
```

Expected: 全 PASS。

- [ ] **Step 8: コミット**

```bash
git add -A
git commit -m "feat: add filename utilities with TDD (sanitize, id, parse, H1 extract)"
```

---

## Task 3: Rust 側パス安全性とワークスペース操作

**Files:**
- Create: `src-tauri/src/path_safety.rs`, `src-tauri/src/workspace.rs`
- Modify: `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`

- [ ] **Step 1: dev-deps を追加**

`src-tauri/Cargo.toml` の `[dev-dependencies]` に `tempfile = "3"` を追加。`[dependencies]` に `serde = { version = "1", features = ["derive"] }` (Tauri が既に依存している場合は重複OK) と `chrono = "0.4"` を追加。

- [ ] **Step 2: `path_safety.rs` のテストを書く**

`src-tauri/src/path_safety.rs`:

```rust
use std::path::{Path, PathBuf};

#[derive(Debug, thiserror::Error)]
pub enum PathError {
    #[error("path escapes workspace")]
    Escape,
    #[error("invalid path: {0}")]
    Invalid(String),
}

pub fn resolve_within(workspace: &Path, relative: &str) -> Result<PathBuf, PathError> {
    if relative.contains('\0') {
        return Err(PathError::Invalid("contains null".into()));
    }
    let candidate = workspace.join(relative);
    let normalized = normalize(&candidate);
    if !normalized.starts_with(workspace) {
        return Err(PathError::Escape);
    }
    Ok(normalized)
}

fn normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for c in path.components() {
        match c {
            std::path::Component::ParentDir => {
                out.pop();
            }
            std::path::Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_parent_traversal() {
        let ws = Path::new("/tmp/ws");
        assert!(resolve_within(ws, "../etc/passwd").is_err());
        assert!(resolve_within(ws, "a/../../../etc/passwd").is_err());
    }

    #[test]
    fn allows_simple_filename() {
        let ws = Path::new("/tmp/ws");
        let p = resolve_within(ws, "foo.md").unwrap();
        assert_eq!(p, PathBuf::from("/tmp/ws/foo.md"));
    }

    #[test]
    fn allows_stash_subfolder() {
        let ws = Path::new("/tmp/ws");
        let p = resolve_within(ws, ".stash/foo.md").unwrap();
        assert_eq!(p, PathBuf::from("/tmp/ws/.stash/foo.md"));
    }

    #[test]
    fn rejects_null_byte() {
        let ws = Path::new("/tmp/ws");
        assert!(resolve_within(ws, "foo\0.md").is_err());
    }
}
```

`thiserror` を `Cargo.toml` の deps に追加（`thiserror = "1"`）。

- [ ] **Step 3: cargo test で path_safety をビルド・実行**

```bash
cd src-tauri && cargo test path_safety
```

Expected: 4 tests pass。

- [ ] **Step 4: `workspace.rs` のテストを書く**

`src-tauri/src/workspace.rs`:

```rust
use crate::path_safety::resolve_within;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub title: String,
    pub mtime_ms: u128,
}

#[derive(Debug, thiserror::Error)]
pub enum WsError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("path: {0}")]
    Path(#[from] crate::path_safety::PathError),
    #[error("not found")]
    NotFound,
}

const STASH_DIR: &str = ".stash";
const TITLE_PEEK_BYTES: usize = 4096;

fn extract_first_h1(content: &str) -> String {
    for line in content.lines() {
        if let Some(rest) = line.strip_prefix("# ") {
            return rest.trim().to_string();
        }
    }
    String::new()
}

pub fn list_markdown_files(workspace: &Path) -> Result<Vec<FileEntry>, WsError> {
    if !workspace.exists() {
        return Err(WsError::NotFound);
    }
    let mut out = Vec::new();
    for entry in fs::read_dir(workspace)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() { continue; }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        if !name.ends_with(".md") { continue; }
        if name.starts_with('.') { continue; }

        let mtime_ms = entry.metadata()?.modified()?
            .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis();

        let title = peek_title(&path)?;
        out.push(FileEntry { name, title, mtime_ms });
    }
    out.sort_by(|a, b| b.mtime_ms.cmp(&a.mtime_ms));
    Ok(out)
}

pub fn list_stash_files(workspace: &Path) -> Result<Vec<FileEntry>, WsError> {
    let stash = workspace.join(STASH_DIR);
    if !stash.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in fs::read_dir(&stash)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() { continue; }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        if !name.ends_with(".md") { continue; }
        let mtime_ms = entry.metadata()?.modified()?
            .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis();
        let title = peek_title(&path)?;
        out.push(FileEntry { name, title, mtime_ms });
    }
    out.sort_by(|a, b| b.mtime_ms.cmp(&a.mtime_ms));
    Ok(out)
}

fn peek_title(path: &Path) -> Result<String, WsError> {
    use std::io::Read;
    let mut f = fs::File::open(path)?;
    let mut buf = vec![0u8; TITLE_PEEK_BYTES];
    let n = f.read(&mut buf)?;
    let text = String::from_utf8_lossy(&buf[..n]);
    Ok(extract_first_h1(&text))
}

pub fn read_document(workspace: &Path, name: &str) -> Result<String, WsError> {
    let path = resolve_within(workspace, name)?;
    Ok(fs::read_to_string(path)?)
}

pub fn write_document(workspace: &Path, name: &str, content: &str) -> Result<(), WsError> {
    let path = resolve_within(workspace, name)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, content)?;
    Ok(())
}

pub fn rename_document(workspace: &Path, from: &str, to: &str) -> Result<(), WsError> {
    let src = resolve_within(workspace, from)?;
    let dst = resolve_within(workspace, to)?;
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::rename(src, dst)?;
    Ok(())
}

pub fn delete_document(workspace: &Path, name: &str) -> Result<(), WsError> {
    let path = resolve_within(workspace, name)?;
    fs::remove_file(path)?;
    Ok(())
}

pub fn stash_document(workspace: &Path, name: &str) -> Result<String, WsError> {
    let stash = workspace.join(STASH_DIR);
    fs::create_dir_all(&stash)?;
    let dst_name = format!("{}/{}", STASH_DIR, name);
    rename_document(workspace, name, &dst_name)?;
    Ok(dst_name)
}

pub fn restore_stash(workspace: &Path, stashed_name: &str) -> Result<String, WsError> {
    // stashed_name is just the filename (no .stash/ prefix). We prepend .stash/ for source.
    let src = format!("{}/{}", STASH_DIR, stashed_name);
    rename_document(workspace, &src, stashed_name)?;
    Ok(stashed_name.to_string())
}

pub fn delete_stash(workspace: &Path, stashed_name: &str) -> Result<(), WsError> {
    let path = resolve_within(workspace, &format!("{}/{}", STASH_DIR, stashed_name))?;
    fs::remove_file(path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn write_and_read_roundtrip() {
        let dir = TempDir::new().unwrap();
        write_document(dir.path(), "hello_abc123.md", "# Hello\nworld").unwrap();
        let read = read_document(dir.path(), "hello_abc123.md").unwrap();
        assert_eq!(read, "# Hello\nworld");
    }

    #[test]
    fn list_returns_md_files_sorted_by_mtime() {
        let dir = TempDir::new().unwrap();
        write_document(dir.path(), "a_aaaaaa.md", "# A").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(10));
        write_document(dir.path(), "b_bbbbbb.md", "# B").unwrap();
        let files = list_markdown_files(dir.path()).unwrap();
        assert_eq!(files.len(), 2);
        assert_eq!(files[0].name, "b_bbbbbb.md");
        assert_eq!(files[0].title, "B");
        assert_eq!(files[1].name, "a_aaaaaa.md");
    }

    #[test]
    fn list_excludes_hidden_files() {
        let dir = TempDir::new().unwrap();
        write_document(dir.path(), "visible_aaaaaa.md", "# V").unwrap();
        std::fs::create_dir_all(dir.path().join(".stash")).unwrap();
        std::fs::write(dir.path().join(".stash/hidden_bbbbbb.md"), "# H").unwrap();
        let files = list_markdown_files(dir.path()).unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].name, "visible_aaaaaa.md");
    }

    #[test]
    fn rename_moves_file() {
        let dir = TempDir::new().unwrap();
        write_document(dir.path(), "old_aaaaaa.md", "x").unwrap();
        rename_document(dir.path(), "old_aaaaaa.md", "new_bbbbbb.md").unwrap();
        assert!(read_document(dir.path(), "old_aaaaaa.md").is_err());
        assert_eq!(read_document(dir.path(), "new_bbbbbb.md").unwrap(), "x");
    }

    #[test]
    fn stash_and_restore_roundtrip() {
        let dir = TempDir::new().unwrap();
        write_document(dir.path(), "doc_aaaaaa.md", "stash me").unwrap();
        stash_document(dir.path(), "doc_aaaaaa.md").unwrap();
        assert!(dir.path().join(".stash/doc_aaaaaa.md").exists());
        let stash = list_stash_files(dir.path()).unwrap();
        assert_eq!(stash.len(), 1);
        restore_stash(dir.path(), "doc_aaaaaa.md").unwrap();
        assert!(dir.path().join("doc_aaaaaa.md").exists());
        assert!(!dir.path().join(".stash/doc_aaaaaa.md").exists());
    }

    #[test]
    fn rejects_path_escape() {
        let dir = TempDir::new().unwrap();
        assert!(read_document(dir.path(), "../etc/passwd").is_err());
        assert!(write_document(dir.path(), "../bad.md", "x").is_err());
    }

    #[test]
    fn peek_title_reads_first_h1() {
        let dir = TempDir::new().unwrap();
        write_document(dir.path(), "doc_aaaaaa.md", "## sub\n# Title\nbody").unwrap();
        let files = list_markdown_files(dir.path()).unwrap();
        assert_eq!(files[0].title, "Title");
    }
}
```

- [ ] **Step 5: `lib.rs` から workspace と path_safety を公開**

`src-tauri/src/lib.rs` の先頭にモジュール宣言を追加：

```rust
mod path_safety;
mod workspace;
```

- [ ] **Step 6: cargo test を実行して全テスト通過確認**

```bash
cd src-tauri && cargo test
```

Expected: workspace 7 tests + path_safety 4 tests = 11 PASS。

- [ ] **Step 7: コミット**

```bash
git add -A
git commit -m "feat: add Rust workspace operations and path safety with tests"
```

---

## Task 4: Tauri commands と TS FS ラッパー

**Files:**
- Create: `src-tauri/src/commands.rs`, `src/lib/fs/index.ts`, `src/types/index.ts`(modify)
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Tauri commands を実装**

`src-tauri/src/commands.rs`:

```rust
use crate::workspace::{
    delete_document, delete_stash, list_markdown_files, list_stash_files, read_document,
    rename_document, restore_stash, stash_document, write_document, FileEntry,
};
use std::path::PathBuf;

#[tauri::command]
pub fn ws_list(workspace: String) -> Result<Vec<FileEntry>, String> {
    list_markdown_files(&PathBuf::from(&workspace)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ws_list_stash(workspace: String) -> Result<Vec<FileEntry>, String> {
    list_stash_files(&PathBuf::from(&workspace)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ws_read(workspace: String, name: String) -> Result<String, String> {
    read_document(&PathBuf::from(&workspace), &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ws_write(workspace: String, name: String, content: String) -> Result<(), String> {
    write_document(&PathBuf::from(&workspace), &name, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ws_rename(workspace: String, from: String, to: String) -> Result<(), String> {
    rename_document(&PathBuf::from(&workspace), &from, &to).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ws_delete(workspace: String, name: String) -> Result<(), String> {
    delete_document(&PathBuf::from(&workspace), &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ws_stash(workspace: String, name: String) -> Result<String, String> {
    stash_document(&PathBuf::from(&workspace), &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ws_restore_stash(workspace: String, name: String) -> Result<String, String> {
    restore_stash(&PathBuf::from(&workspace), &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ws_delete_stash(workspace: String, name: String) -> Result<(), String> {
    delete_stash(&PathBuf::from(&workspace), &name).map_err(|e| e.to_string())
}
```

- [ ] **Step 2: commands を登録**

`src-tauri/src/lib.rs` を以下に置き換える：

```rust
mod commands;
mod path_safety;
mod workspace;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::ws_list,
            commands::ws_list_stash,
            commands::ws_read,
            commands::ws_write,
            commands::ws_rename,
            commands::ws_delete,
            commands::ws_stash,
            commands::ws_restore_stash,
            commands::ws_delete_stash,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: `src/types/index.ts` を更新**

```ts
export interface FileEntry {
  name: string
  title: string
  mtimeMs: number
}

export interface Document {
  /** filename in workspace, e.g. "設計メモ_abc123.md" */
  name: string
  /** parsed title from filename */
  title: string
  /** id portion of filename */
  id: string
  /** markdown content */
  content: string
}
```

- [ ] **Step 4: `src/lib/fs/index.ts` を実装**

```ts
import { invoke } from '@tauri-apps/api/core'
import type { FileEntry } from '@/types'

interface RawFileEntry {
  name: string
  title: string
  mtime_ms: number
}

function toEntry(raw: RawFileEntry): FileEntry {
  return { name: raw.name, title: raw.title, mtimeMs: raw.mtime_ms }
}

export async function listMarkdownFiles(workspace: string): Promise<FileEntry[]> {
  const raw = await invoke<RawFileEntry[]>('ws_list', { workspace })
  return raw.map(toEntry)
}

export async function listStashFiles(workspace: string): Promise<FileEntry[]> {
  const raw = await invoke<RawFileEntry[]>('ws_list_stash', { workspace })
  return raw.map(toEntry)
}

export async function readDocument(workspace: string, name: string): Promise<string> {
  return invoke<string>('ws_read', { workspace, name })
}

export async function writeDocument(workspace: string, name: string, content: string): Promise<void> {
  await invoke('ws_write', { workspace, name, content })
}

export async function renameDocument(workspace: string, from: string, to: string): Promise<void> {
  await invoke('ws_rename', { workspace, from, to })
}

export async function deleteDocument(workspace: string, name: string): Promise<void> {
  await invoke('ws_delete', { workspace, name })
}

export async function stashDocument(workspace: string, name: string): Promise<string> {
  return invoke<string>('ws_stash', { workspace, name })
}

export async function restoreStash(workspace: string, name: string): Promise<string> {
  return invoke<string>('ws_restore_stash', { workspace, name })
}

export async function deleteStash(workspace: string, name: string): Promise<void> {
  await invoke('ws_delete_stash', { workspace, name })
}
```

- [ ] **Step 5: cargo check で Rust 側のビルドが通ることを確認**

```bash
cd src-tauri && cargo check
```

Expected: no errors。

- [ ] **Step 6: コミット**

```bash
git add -A
git commit -m "feat: expose workspace operations via Tauri commands and TS wrappers"
```

---

## Task 5: Markdown → Tiptap 逆変換（TDD）

**Files:**
- Create: `src/lib/markdown/fromMarkdown.ts`, `src/lib/markdown/fromMarkdown.test.ts`

- [ ] **Step 1: 逆変換テストを書く**

`src/lib/markdown/fromMarkdown.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { markdownToTiptap } from './fromMarkdown'
import { tiptapToMarkdown } from './toMarkdown'

describe('markdownToTiptap', () => {
  it('parses paragraph', () => {
    const result = markdownToTiptap('hello world')
    expect(result.type).toBe('doc')
    expect(result.content?.[0]).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: 'hello world' }],
    })
  })

  it('parses headings 1-3', () => {
    const result = markdownToTiptap('# H1\n\n## H2\n\n### H3')
    expect(result.content).toHaveLength(3)
    expect(result.content?.[0]).toMatchObject({ type: 'heading', attrs: { level: 1 } })
    expect(result.content?.[1]).toMatchObject({ type: 'heading', attrs: { level: 2 } })
    expect(result.content?.[2]).toMatchObject({ type: 'heading', attrs: { level: 3 } })
  })

  it('parses bullet list', () => {
    const result = markdownToTiptap('- a\n- b')
    expect(result.content?.[0]?.type).toBe('bulletList')
    expect(result.content?.[0]?.content).toHaveLength(2)
  })

  it('parses ordered list', () => {
    const result = markdownToTiptap('1. a\n2. b')
    expect(result.content?.[0]?.type).toBe('orderedList')
  })

  it('parses task list', () => {
    const result = markdownToTiptap('- [ ] todo\n- [x] done')
    expect(result.content?.[0]?.type).toBe('taskList')
    const items = result.content?.[0]?.content ?? []
    expect(items[0]?.attrs?.checked).toBe(false)
    expect(items[1]?.attrs?.checked).toBe(true)
  })

  it('parses blockquote', () => {
    const result = markdownToTiptap('> quoted')
    expect(result.content?.[0]?.type).toBe('blockquote')
  })

  it('parses fenced code block with language', () => {
    const result = markdownToTiptap('```ts\nconst x = 1\n```')
    expect(result.content?.[0]).toMatchObject({
      type: 'codeBlock',
      attrs: { language: 'ts' },
    })
  })

  it('parses horizontal rule', () => {
    const result = markdownToTiptap('---')
    expect(result.content?.[0]?.type).toBe('horizontalRule')
  })

  it('parses bold and italic and strike and code marks', () => {
    const result = markdownToTiptap('**b** *i* ~~s~~ `c`')
    const para = result.content?.[0]
    expect(para?.type).toBe('paragraph')
    const marks = (para?.content ?? []).map((n) =>
      (n.marks ?? []).map((m) => m.type).sort().join(','),
    )
    expect(marks).toContain('bold')
    expect(marks).toContain('italic')
    expect(marks).toContain('strike')
    expect(marks).toContain('code')
  })

  it('parses link', () => {
    const result = markdownToTiptap('[Zen](https://example.com)')
    const link = result.content?.[0]?.content?.[0]
    expect(link?.marks?.[0]?.type).toBe('link')
    expect(link?.marks?.[0]?.attrs?.href).toBe('https://example.com')
  })

  it('parses image', () => {
    const result = markdownToTiptap('![alt](https://example.com/x.png)')
    expect(result.content?.[0]).toMatchObject({
      type: 'image',
      attrs: { src: 'https://example.com/x.png', alt: 'alt' },
    })
  })

  it('returns empty doc for empty input', () => {
    const result = markdownToTiptap('')
    expect(result.type).toBe('doc')
    expect(result.content).toEqual([])
  })
})

describe('roundtrip md → tiptap → md', () => {
  const cases = [
    '# Hello',
    '# Hello\n\nworld',
    '- a\n- b\n- c\n',
    '1. a\n2. b\n',
    '- [ ] todo\n- [x] done\n',
    '> quoted line\n',
    '```ts\nconst x = 1\n```\n',
    '---\n',
    '**bold** and *italic* and ~~strike~~ and `code`\n',
    '[link](https://example.com)\n',
  ]
  for (const md of cases) {
    it(`roundtrips: ${JSON.stringify(md.slice(0, 30))}`, () => {
      const json = markdownToTiptap(md)
      const back = tiptapToMarkdown(json)
      expect(back.trim()).toBe(md.trim())
    })
  }
})
```

- [ ] **Step 2: テストを実行して失敗確認**

```bash
npm test
```

Expected: 全 FAIL（モジュール未定義）。

- [ ] **Step 3: `src/lib/markdown/fromMarkdown.ts` を実装**

```ts
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import type { JSONContent } from '@tiptap/react'
import type { Root, RootContent, PhrasingContent } from 'mdast'

const processor = unified().use(remarkParse).use(remarkGfm)

export function markdownToTiptap(markdown: string): JSONContent {
  const tree = processor.parse(markdown) as Root
  const content = (tree.children ?? [])
    .map(convertBlock)
    .filter((n): n is JSONContent => n !== null)
  return { type: 'doc', content }
}

function convertBlock(node: RootContent): JSONContent | null {
  switch (node.type) {
    case 'paragraph':
      return { type: 'paragraph', content: convertInlines(node.children) }
    case 'heading':
      return {
        type: 'heading',
        attrs: { level: Math.min(3, Math.max(1, node.depth)) },
        content: convertInlines(node.children),
      }
    case 'list': {
      const isTaskList = node.children.every((it) => 'checked' in it && it.checked !== null)
      if (isTaskList) {
        return {
          type: 'taskList',
          content: node.children.map((it) => ({
            type: 'taskItem',
            attrs: { checked: Boolean(it.checked) },
            content: it.children.map((c) => convertBlock(c as RootContent)).filter(Boolean) as JSONContent[],
          })),
        }
      }
      return {
        type: node.ordered ? 'orderedList' : 'bulletList',
        attrs: node.ordered && node.start ? { start: node.start } : undefined,
        content: node.children.map((it) => ({
          type: 'listItem',
          content: it.children.map((c) => convertBlock(c as RootContent)).filter(Boolean) as JSONContent[],
        })),
      }
    }
    case 'blockquote':
      return {
        type: 'blockquote',
        content: node.children.map(convertBlock).filter(Boolean) as JSONContent[],
      }
    case 'code':
      return {
        type: 'codeBlock',
        attrs: { language: node.lang ?? 'plaintext' },
        content: node.value ? [{ type: 'text', text: node.value }] : [],
      }
    case 'thematicBreak':
      return { type: 'horizontalRule' }
    case 'image':
      return { type: 'image', attrs: { src: node.url, alt: node.alt ?? '' } }
    default:
      return null
  }
}

function convertInlines(nodes: PhrasingContent[]): JSONContent[] {
  const out: JSONContent[] = []
  for (const n of nodes) {
    const converted = convertInline(n, [])
    out.push(...converted)
  }
  return out
}

function convertInline(node: PhrasingContent, marks: { type: string; attrs?: Record<string, unknown> }[]): JSONContent[] {
  switch (node.type) {
    case 'text':
      return [{ type: 'text', text: node.value, marks: marks.length ? marks : undefined }]
    case 'strong':
      return node.children.flatMap((c) => convertInline(c, [...marks, { type: 'bold' }]))
    case 'emphasis':
      return node.children.flatMap((c) => convertInline(c, [...marks, { type: 'italic' }]))
    case 'delete':
      return node.children.flatMap((c) => convertInline(c, [...marks, { type: 'strike' }]))
    case 'inlineCode':
      return [{ type: 'text', text: node.value, marks: [...marks, { type: 'code' }] }]
    case 'link':
      return node.children.flatMap((c) =>
        convertInline(c, [...marks, { type: 'link', attrs: { href: node.url } }]),
      )
    case 'image':
      return [{ type: 'image', attrs: { src: node.url, alt: node.alt ?? '' } }]
    case 'break':
      return [{ type: 'hardBreak' }]
    default:
      return []
  }
}
```

- [ ] **Step 4: テストを通す**

```bash
npm test
```

Expected: 全 PASS。一部 roundtrip テストがフォーマットの微差で失敗する場合は、`toMarkdown` 側で改行調整が必要なケースがあるので、テスト側の `.trim()` 比較で吸収されることを確認する。失敗時は失敗内容を見て個別調整。

- [ ] **Step 5: コミット**

```bash
git add -A
git commit -m "feat: add markdown→Tiptap conversion with roundtrip tests"
```

---

## Task 6: ワークスペースストアの実装

**Files:**
- Create: `src/store/workspaceStore.ts`
- Modify: `src/store/editorStore.ts`, `src/types/index.ts`, `src/lib/storage/localStorage.ts` (削除)

- [ ] **Step 1: 旧 `editorStore` を縮小**

`src/store/editorStore.ts` を削除（次タスクで新規エディタ状態を作る）：

```bash
rm src/store/editorStore.ts
```

`src/lib/storage/localStorage.ts` も削除：

```bash
rm src/lib/storage/localStorage.ts
```

- [ ] **Step 2: ワークスペースストアを実装**

`src/store/workspaceStore.ts`:

```ts
'use client'
import { create } from 'zustand'
import { load, Store } from '@tauri-apps/plugin-store'
import type { Document, FileEntry } from '@/types'
import {
  listMarkdownFiles,
  readDocument,
  writeDocument,
  renameDocument,
  deleteDocument,
  stashDocument,
} from '@/lib/fs'
import { buildFilename, generateId, parseFilename } from '@/lib/fs/filename'

interface WorkspaceState {
  workspace: string | null
  files: FileEntry[]
  active: Document | null
  loading: boolean

  setWorkspace: (path: string) => Promise<void>
  reloadFiles: () => Promise<void>
  openFile: (name: string) => Promise<void>
  createNew: () => Promise<void>
  updateActiveContent: (content: string) => Promise<void>
  deleteFile: (name: string) => Promise<void>
  stashActive: () => Promise<void>
  clearWorkspace: () => Promise<void>
}

let configStore: Store | null = null
async function getConfigStore(): Promise<Store> {
  if (!configStore) configStore = await load('zikon-config.json', { autoSave: true })
  return configStore
}

const WORKSPACE_KEY = 'workspace_path'

export async function loadSavedWorkspace(): Promise<string | null> {
  const s = await getConfigStore()
  const v = await s.get<string>(WORKSPACE_KEY)
  return v ?? null
}

async function saveWorkspace(path: string): Promise<void> {
  const s = await getConfigStore()
  await s.set(WORKSPACE_KEY, path)
}

async function clearSavedWorkspace(): Promise<void> {
  const s = await getConfigStore()
  await s.delete(WORKSPACE_KEY)
}

function emptyDocument(): Document {
  const id = generateId()
  return {
    name: buildFilename('', id),
    title: '',
    id,
    content: '',
  }
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspace: null,
  files: [],
  active: null,
  loading: false,

  setWorkspace: async (path: string) => {
    set({ workspace: path, loading: true })
    await saveWorkspace(path)
    await get().reloadFiles()
    const files = get().files
    if (files.length > 0) {
      await get().openFile(files[0].name)
    } else {
      set({ active: emptyDocument() })
    }
    set({ loading: false })
  },

  reloadFiles: async () => {
    const ws = get().workspace
    if (!ws) return
    const files = await listMarkdownFiles(ws)
    set({ files })
  },

  openFile: async (name: string) => {
    const ws = get().workspace
    if (!ws) return
    const content = await readDocument(ws, name)
    const parsed = parseFilename(name)
    if (!parsed) return
    set({
      active: { name, title: parsed.title, id: parsed.id, content },
    })
  },

  createNew: async () => {
    const ws = get().workspace
    if (!ws) return
    const doc = emptyDocument()
    await writeDocument(ws, doc.name, '')
    set({ active: doc })
    await get().reloadFiles()
  },

  updateActiveContent: async (content: string) => {
    const active = get().active
    const ws = get().workspace
    if (!active || !ws) return

    // Extract H1 from new content; rename file if title changed.
    const { extractFirstH1 } = await import('@/lib/fs/filename')
    const newTitle = extractFirstH1(content)
    const newName = buildFilename(newTitle, active.id)

    if (newName !== active.name) {
      await renameDocument(ws, active.name, newName)
    }
    await writeDocument(ws, newName, content)

    set({
      active: { ...active, name: newName, title: newTitle, content },
    })
    await get().reloadFiles()
  },

  deleteFile: async (name: string) => {
    const ws = get().workspace
    if (!ws) return
    await deleteDocument(ws, name)
    const active = get().active
    if (active?.name === name) {
      set({ active: emptyDocument() })
    }
    await get().reloadFiles()
  },

  stashActive: async () => {
    const ws = get().workspace
    const active = get().active
    if (!ws || !active) return
    const isEmpty = active.title.trim() === '' && active.content.trim() === ''
    if (!isEmpty) {
      // ensure latest content is persisted first
      await writeDocument(ws, active.name, active.content)
      await stashDocument(ws, active.name)
    }
    set({ active: emptyDocument() })
    await get().reloadFiles()
  },

  clearWorkspace: async () => {
    await clearSavedWorkspace()
    set({ workspace: null, files: [], active: null })
  },
}))
```

- [ ] **Step 3: TypeScript 型エラーがないことを確認**

```bash
npx tsc --noEmit
```

既存ファイル（NotionEditor.tsx、StashMenu.tsx 等）から旧 `editorStore` の import が残るためエラーが出るが、次タスク以降で順次解消する。**エラー一覧を確認し、現タスクで導入したコードに起因するエラーがゼロであることだけ確認**。

- [ ] **Step 4: コミット（壊れた状態でのコミットになるが進めるための足がかり）**

```bash
git add -A
git commit -m "feat: add workspace store backed by Tauri Store and FS (WIP: editor wiring next)"
```

---

## Task 7: ウェルカム画面（フォルダ選択）

**Files:**
- Create: `src/components/welcome/WelcomeScreen.tsx`, `src/app/welcome/page.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: ウェルカムスクリーンを実装**

`src/components/welcome/WelcomeScreen.tsx`:

```tsx
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
      if (!picked) return
      const path = typeof picked === 'string' ? picked : picked[0]
      await setWorkspace(path)
      router.replace('/zen')
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] text-[var(--foreground)]">
      <div className="max-w-md text-center">
        <h1 className="mb-3 text-3xl font-bold">Zikon</h1>
        <p className="mb-8 text-sm text-[var(--muted-foreground)]">
          ドキュメントを保存するフォルダを選んでください。
          このフォルダの中に `.md` ファイルが保存されます。
        </p>
        <button
          type="button"
          onClick={handlePick}
          disabled={busy}
          className="rounded-md bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? '読み込み中…' : 'フォルダを選択'}
        </button>
        {err && (
          <p className="mt-4 text-xs text-red-400">{err}</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: ウェルカムページを作成**

`src/app/welcome/page.tsx`:

```tsx
import { WelcomeScreen } from '@/components/welcome/WelcomeScreen'

export default function WelcomePage() {
  return <WelcomeScreen />
}
```

- [ ] **Step 3: ルート `/` をワークスペース判定にする**

`src/app/page.tsx`:

```tsx
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { loadSavedWorkspace, useWorkspaceStore } from '@/store/workspaceStore'

export default function RootPage() {
  const router = useRouter()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace)

  useEffect(() => {
    async function bootstrap() {
      if (workspace) {
        router.replace('/zen')
        return
      }
      const saved = await loadSavedWorkspace()
      if (saved) {
        try {
          await setWorkspace(saved)
          router.replace('/zen')
        } catch {
          router.replace('/welcome')
        }
      } else {
        router.replace('/welcome')
      }
    }
    bootstrap()
  }, [workspace, router, setWorkspace])

  return null
}
```

- [ ] **Step 4: コミット**

```bash
git add -A
git commit -m "feat: add welcome screen with folder picker and bootstrap flow"
```

---

## Task 8: エディター改修（H1=タイトル、ファイルベース保存）

**Files:**
- Modify: `src/components/editor/NotionEditor.tsx`, `src/app/(app)/zen/page.tsx`

- [ ] **Step 1: NotionEditor を新ワークスペースストア駆動に書き換え**

`src/components/editor/NotionEditor.tsx` の `useEditorStore` 参照を削除し、`useWorkspaceStore` を使う。`initialContent` の出処はストアから直接取得し、`onUpdate` は `updateActiveContent` を呼ぶ。

```tsx
'use client'
import { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { lowlight } from './lowlight'
import { SlashCommand } from './slash/SlashCommand'
import { BubbleMenuBar } from './BubbleMenuBar'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { markdownToTiptap } from '@/lib/markdown/fromMarkdown'
import { tiptapToMarkdown } from '@/lib/markdown/toMarkdown'

const INDENT = '  '
const AUTO_SAVE_MS = 600

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
}

export function NotionEditor({ docKey, initialMarkdown }: NotionEditorProps) {
  const updateActiveContent = useWorkspaceStore((s) => s.updateActiveContent)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ codeBlock: false, heading: { levels: [1, 2, 3] } }),
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
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') return '無題のタイトル'
          return "「/」でコマンド、本文を書き始めてください"
        },
      }),
      SlashCommand,
    ],
    content: markdownToTiptap(initialMarkdown),
    onUpdate: ({ editor }) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        const md = tiptapToMarkdown(editor.getJSON())
        updateActiveContent(md)
      }, AUTO_SAVE_MS)
    },
    editorProps: {
      attributes: { class: 'ProseMirror' },
      handleDrop: (view, event) => {
        const file = event.dataTransfer?.files?.[0]
        if (!file || !file.type.startsWith('image/')) return false
        event.preventDefault()
        const reader = new FileReader()
        reader.onload = () => {
          const src = reader.result as string
          const { schema } = view.state
          const node = schema.nodes.image.create({ src })
          view.dispatch(view.state.tr.replaceSelectionWith(node))
        }
        reader.readAsDataURL(file)
        return true
      },
    },
  }, [docKey])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <div className="w-full">
      <BubbleMenuBar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  )
}
```

- [ ] **Step 2: Zen ページを書き換え**

`src/app/(app)/zen/page.tsx`:

```tsx
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { NotionEditor } from '@/components/editor/NotionEditor'
import { StashMenu } from '@/components/editor/StashMenu'

export default function ZenPage() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const active = useWorkspaceStore((s) => s.active)
  const router = useRouter()

  useEffect(() => {
    if (!workspace) router.replace('/')
  }, [workspace, router])

  if (!workspace || !active) return null

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-end border-b border-[var(--border)] bg-[var(--background)] px-6 py-2">
        <StashMenu />
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <NotionEditor docKey={active.id} initialMarkdown={active.content} />
      </main>
    </>
  )
}
```

- [ ] **Step 3: TypeScript エラー解消**

```bash
npx tsc --noEmit
```

残るのは `StashMenu.tsx` と slash items の旧参照だけのはず。次タスクで解消。

- [ ] **Step 4: コミット**

```bash
git add -A
git commit -m "feat: rewire NotionEditor and Zen page to workspace store with H1 as title"
```

---

## Task 9: Stash 機能をファイル mv ベースに

**Files:**
- Modify: `src/components/editor/StashMenu.tsx`, `src/components/editor/slash/items.ts`

- [ ] **Step 1: slash の `/stash` を新ストアの `stashActive` に切替**

`src/components/editor/slash/items.ts` の stash コマンドを変更：

```ts
import { useWorkspaceStore } from '@/store/workspaceStore'

// ... 既存 items 配列内の stash アイテム:
  {
    title: 'ドキュメントを退避',
    description: '現在の内容を .stash/ に移動して新規作成',
    searchTerms: ['stash', 'save', 'new', '退避', '新規', 'たいひ'],
    icon: '⇣',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run()
      // すぐに stash 実行（content は updateActiveContent 経由で flush される必要があるので順序注意）
      const store = useWorkspaceStore.getState()
      store.stashActive()
    },
  },
```

ファイル全体の旧 `useEditorStore` import を削除し、`useWorkspaceStore` 参照に変更。

- [ ] **Step 2: StashMenu を Stash ファイルリスト表示に書き換え**

`src/components/editor/StashMenu.tsx`:

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { listStashFiles, restoreStash, deleteStash, readDocument } from '@/lib/fs'
import type { FileEntry } from '@/types'

function formatRelative(ms: number): string {
  const diff = Date.now() - ms
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'たった今'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}分前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}時間前`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day}日前`
  return new Date(ms).toLocaleDateString('ja-JP')
}

export function StashMenu() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const reloadFiles = useWorkspaceStore((s) => s.reloadFiles)
  const openFile = useWorkspaceStore((s) => s.openFile)

  const [stashes, setStashes] = useState<FileEntry[]>([])
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !workspace) return
    listStashFiles(workspace).then(setStashes)
  }, [open, workspace])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.document.addEventListener('mousedown', onDocClick)
    window.document.addEventListener('keydown', onKey)
    return () => {
      window.document.removeEventListener('mousedown', onDocClick)
      window.document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const handleRestore = async (s: FileEntry) => {
    if (!workspace) return
    await restoreStash(workspace, s.name)
    await reloadFiles()
    await openFile(s.name)
    setOpen(false)
  }

  const handleDelete = async (s: FileEntry) => {
    if (!workspace) return
    if (!confirm(`「${s.title || '無題'}」を削除しますか？`)) return
    await deleteStash(workspace, s.name)
    setStashes((cur) => cur.filter((x) => x.name !== s.name))
  }

  return (
    <div ref={containerRef} className="relative flex items-center gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Stash"
        className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--accent)] ${
          open ? 'bg-[var(--accent)]' : ''
        }`}
      >
        <span>Stash</span>
        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded bg-[var(--muted)] px-1 text-[10px] tabular-nums text-[var(--muted-foreground)]">
          {stashes.length}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-80 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--background)] shadow-lg">
          {stashes.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-[var(--muted-foreground)]">
              Stashはありません
            </div>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {stashes.map((s) => (
                <li
                  key={s.name}
                  className="group flex items-start gap-2 border-b border-[var(--border)] px-3 py-2.5 last:border-b-0 hover:bg-[var(--accent)]"
                >
                  <button
                    type="button"
                    onClick={() => handleRestore(s)}
                    className="min-w-0 flex-1 text-left"
                    title="復元"
                  >
                    <div className="truncate text-sm font-medium text-[var(--foreground)]">
                      {s.title || '無題'}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">
                      {s.name}
                    </div>
                    <div className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                      {formatRelative(s.mtimeMs)}に退避
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(s)}
                    title="削除"
                    className="mt-0.5 rounded p-1 text-[var(--muted-foreground)] opacity-0 transition-opacity hover:bg-[var(--background)] hover:text-[var(--foreground)] group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
```

未使用 import の `readDocument` は削除しておくこと。

- [ ] **Step 3: TypeScript エラーゼロ確認**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: コミット**

```bash
git add -A
git commit -m "feat: rebuild stash with .stash/ file moves via workspace store"
```

---

## Task 10: Kura ページ本実装

**Files:**
- Modify: `src/app/(app)/kura/page.tsx`

- [ ] **Step 1: Kura ページを実装**

`src/app/(app)/kura/page.tsx`:

```tsx
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useWorkspaceStore } from '@/store/workspaceStore'

function formatRelative(ms: number): string {
  const diff = Date.now() - ms
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'たった今'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}分前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}時間前`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day}日前`
  return new Date(ms).toLocaleDateString('ja-JP')
}

export default function KuraPage() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const files = useWorkspaceStore((s) => s.files)
  const reloadFiles = useWorkspaceStore((s) => s.reloadFiles)
  const openFile = useWorkspaceStore((s) => s.openFile)
  const deleteFile = useWorkspaceStore((s) => s.deleteFile)
  const createNew = useWorkspaceStore((s) => s.createNew)
  const router = useRouter()

  useEffect(() => {
    if (!workspace) router.replace('/')
  }, [workspace, router])

  useEffect(() => {
    if (workspace) reloadFiles()
  }, [workspace, reloadFiles])

  if (!workspace) return null

  const handleOpen = async (name: string) => {
    await openFile(name)
    router.push('/zen')
  }

  const handleDelete = async (name: string, title: string) => {
    if (!confirm(`「${title || '無題'}」を削除しますか？`)) return
    await deleteFile(name)
  }

  const handleNew = async () => {
    await createNew()
    router.push('/zen')
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Kura</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => reloadFiles()}
            className="rounded px-2.5 py-1 text-xs text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
          >
            再読み込み
          </button>
          <button
            type="button"
            onClick={handleNew}
            className="rounded bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            ＋ 新規作成
          </button>
        </div>
      </div>

      {files.length === 0 ? (
        <div className="mt-12 flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] py-20 text-center">
          <p className="text-sm text-[var(--muted-foreground)]">
            まだドキュメントがありません
          </p>
          <button
            type="button"
            onClick={handleNew}
            className="mt-4 rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            新規作成
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">
          {files.map((f) => (
            <li key={f.name} className="group flex items-start gap-2 px-4 py-3 hover:bg-[var(--accent)]">
              <button
                type="button"
                onClick={() => handleOpen(f.name)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="truncate text-sm font-medium text-[var(--foreground)]">
                  {f.title || '無題'}
                </div>
                <div className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">
                  {f.name}
                </div>
                <div className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                  {formatRelative(f.mtimeMs)}に更新
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleDelete(f.name, f.title)}
                title="削除"
                className="mt-0.5 rounded p-1 text-[var(--muted-foreground)] opacity-0 transition-opacity hover:bg-[var(--background)] hover:text-[var(--foreground)] group-hover:opacity-100"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
```

- [ ] **Step 2: コミット**

```bash
git add -A
git commit -m "feat: implement Kura page with file list, open, delete, and new"
```

---

## Task 11: サイドバーにワークスペース切替を追加

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: サイドバーにワークスペース表示と切替リンクを追加**

`src/components/layout/Sidebar.tsx`:

```tsx
'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useWorkspaceStore } from '@/store/workspaceStore'

const navItems = [
  { href: '/zen', label: 'Zen' },
  { href: '/kura', label: 'Kura' },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const clearWorkspace = useWorkspaceStore((s) => s.clearWorkspace)

  const handleChange = async () => {
    await clearWorkspace()
    router.replace('/welcome')
  }

  const wsDisplay = workspace
    ? workspace.split('/').filter(Boolean).slice(-2).join('/')
    : ''

  return (
    <aside className="flex h-screen w-56 flex-shrink-0 flex-col border-r border-[var(--border)] bg-[var(--muted)]">
      <div className="px-4 py-4">
        <span className="text-sm font-semibold tracking-wide text-[var(--foreground)]">
          Zikon
        </span>
      </div>

      <nav className="flex-1 px-2 py-2">
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`block rounded px-2.5 py-1.5 text-sm transition-colors ${
                    active
                      ? 'bg-[var(--accent)] text-[var(--foreground)]'
                      : 'text-[var(--muted-foreground)] hover:bg-[var(--accent)]/60 hover:text-[var(--foreground)]'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="border-t border-[var(--border)] px-3 py-3 text-xs">
        <div className="truncate text-[var(--muted-foreground)]" title={workspace ?? ''}>
          {wsDisplay || '未選択'}
        </div>
        <button
          type="button"
          onClick={handleChange}
          className="mt-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          ワークスペースを変更
        </button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: コミット**

```bash
git add -A
git commit -m "feat: show workspace path and switch link in sidebar"
```

---

## Task 12: 最終検証とドキュメント整理

**Files:**
- Modify: `README.md` (optional)

- [ ] **Step 1: 全テストを実行**

```bash
npm test
cd src-tauri && cargo test && cd ..
```

Expected: 全 PASS。

- [ ] **Step 2: TypeScript の strict check**

```bash
npx tsc --noEmit
```

Expected: no errors。

- [ ] **Step 3: Tauri dev で手動シナリオ確認**

```bash
npm run tauri:dev
```

確認シナリオ：

| シナリオ | 期待結果 |
|---|---|
| 初回起動 | `/welcome` 表示 → フォルダ選択 → Zen に遷移 |
| Zen でテキスト入力 + H1 入力 | 600ms 後にファイルが生成される（Finder で確認） |
| H1 を変更 | 600ms 後にファイル名が追従リネーム |
| `/stash` 実行 | 現ファイルが `.stash/` に移動、エディタが空に |
| Stash 一覧から復元 | ファイルがワークスペースに戻り、エディタで開かれる |
| Kura でファイル選択 | Zen に遷移し、選んだファイルが開く |
| Kura で削除 | 確認後ファイルが消える |
| サイドバー「ワークスペースを変更」 | `/welcome` に遷移、再選択可能 |
| アプリ再起動 | 直前のワークスペースが復元される |

- [ ] **Step 4: Tauri build で実プロダクションビルド確認**

```bash
npm run tauri:build
```

Expected: `src-tauri/target/release/bundle/` に dmg や app バンドルが生成される。

- [ ] **Step 5: 仕様書外のメモを除去、最終コミット**

```bash
git add -A
git status  # 差分がないこと確認
git commit --allow-empty -m "chore: complete local-first .md files migration"
```

---

## 完了条件

1. アプリ起動時にフォルダ選択画面が出る
2. 選択したフォルダ直下に `{H1}_{ID}.md` 形式でドキュメントが保存される
3. H1 編集で 600ms 後にファイル名がリネームされる
4. Stash が `.stash/` への mv で実装されている
5. Kura でファイル一覧・開く・削除・新規作成ができる
6. サイドバーからワークスペースを変更できる
7. アプリ再起動で直前のワークスペースが復元される
8. cargo test と vitest が全 PASS
9. Tauri build がエラーなく通る
