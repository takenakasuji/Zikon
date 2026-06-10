# Zikon

A calm, local-first Markdown editor — your documents are plain `.md` files in a
folder you choose, edited in a focused block editor. Built as a desktop app with
[Tauri](https://tauri.app) (Rust shell) and a [Next.js](https://nextjs.org)
frontend.

- **Local-first** — everything is plain `.md` inside a folder you pick. No cloud, no lock-in.
- **Focused writing** — a Notion-style block editor (Tiptap) with a slash menu, bubble menu, and Markdown shortcuts.
- **Save on purpose** — autosave-while-editing is separated from the archive (Kura); only what you deliberately save is kept.
- **Data-safety first** — your edits autosave to a hidden folder and survive app restarts and navigation between views.

---

## Document lifecycle (Working / Kura / Stash)

Zikon keeps documents in three "locations". **Editing alone never puts a document
in Kura (the archive)** — only running `save` does.

| Location | Backing store | Role | Listed in |
|---|---|---|---|
| **Working** (Zen) | `.work/` (hidden) | the single document being edited | nowhere |
| **Kura** (archive) | `*.md` at workspace root | only `save`d documents | Kura page, palette, search |
| **Stash** (temporary) | `.stash/*.md` | documents set aside for now | Stash menu in the Zen header |

A document is identified by a stable `id` (embedded in the filename `<title>_<id>.md`),
which is the only link across locations.

### Commands

- **edit (autosave)** — writes only to `.work/`, never to Kura. An empty document (no title and no body) leaves nothing behind.
- **save** (⌘S / palette "Save to Kura" / slash command) — write the Working document to Kura, and clean up any same-`id` copy in Stash or under an old filename. The document **stays open in Zen** afterwards.
- **stash** — move the Working document to `.stash/` and remove any same-`id` copy from Kura (so it "no longer exists in Kura"). Zen resets to a fresh empty document.
- **open** — load a Kura row / palette entry / Stash item as the Working document. **The source file stays in place** until a later save/stash moves it.
- **new** — start a fresh empty Working document.

### Displacement (opening or creating another document while the current one is unsaved)

There is always exactly one Working document. When an action would replace it, a
**dirty, non-empty** Working document is auto-stashed first (no work is lost). A
clean or empty one is discarded — its source copy, if any, stays intact in Kura/Stash.

> See [`docs/superpowers/specs/2026-06-10-working-document-lifecycle-design.md`](docs/superpowers/specs/2026-06-10-working-document-lifecycle-design.md) for the full design.

---

## Screens

- **Welcome** — pick the folder (workspace) where documents are stored.
- **Zen** — the writing surface: block editor, title input, and the Stash menu in the header.
- **Kura** — a list of saved documents with full-text search.
- **Settings** — change the workspace and theme (dark / light / system).

## Editor

A [Tiptap](https://tiptap.dev)-based block editor. Input is round-tripped to clean
Markdown through mdast/remark internally (GFM supported).

- **Slash menu (`/`)** — Text / Heading 1–3 / Bullet, Numbered & Checklist / Quote / Code block (syntax highlighting) / Divider, plus *Save to Kura* and *Stash document* actions.
- **Bubble menu (on text selection)** — Heading 1–3 / Bold / Italic / Strikethrough / Inline code / Link / Clear formatting.
- **Markdown shortcuts** — type `#`, `-`, `>`, etc. to convert blocks instantly.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Command palette |
| `⌘S` / `Ctrl+S` | Save to Kura |
| `⌘N` / `Ctrl+N` | New document |
| `↑` / `↓` | Move the cursor between the title and the body |

---

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org) (20 or newer recommended)
- To build/run the desktop app: the [Rust toolchain](https://www.rust-lang.org/tools/install) and
  [Tauri's prerequisites](https://tauri.app/start/prerequisites/) for your OS

### Setup

```bash
npm install
```

### Develop

```bash
# Run as the desktop app (full functionality, incl. file saving)
npm run tauri:dev

# Frontend only (http://localhost:3000)
# Note: filesystem/dialog features only work under the Tauri runtime
npm run dev
```

### Build

```bash
# Build the distributable desktop app
npm run tauri:build

# Static export of the Next.js frontend (to out/)
npm run build
```

### Test

```bash
npm test          # vitest (single run)
npm run test:watch
```

---

## Tech stack

- **Frontend**: Next.js 16 (App Router, static export) / React 19 / TypeScript
- **Styling**: Tailwind CSS v4 (theme tokens; dark/light/system)
- **Editor**: Tiptap 3 / lowlight (syntax highlighting)
- **Markdown**: unified · remark (remark-parse / remark-gfm / remark-rehype) · mdast
- **State**: Zustand
- **UI primitives**: Base UI (Dialog / AlertDialog / Popover)
- **Desktop**: Tauri 2 (Rust) / plugin-fs · plugin-dialog · plugin-store

## Project layout

```
src/
  app/                 Next.js routes (welcome, (app)/zen|kura|settings)
  components/
    editor/            Tiptap editor, slash/bubble menus, Stash menu
    command/           command palette
    layout/            sidebar, theme setting
    ui/                Toaster, ConfirmDialog
  store/               Zustand stores (workspace, theme, toast, confirm)
  lib/
    markdown/          Markdown ⇄ Tiptap round-trip via mdast/remark
    fs/                Tauri filesystem helpers
src-tauri/             Tauri (Rust) shell
docs/                  design specs and implementation plans
```

## Where your data lives

Everything is stored as plain Markdown inside the workspace folder you pick.

- `*.md` (root) — documents saved to Kura
- `.stash/*.md` — temporarily set-aside documents
- `.work/` — the Working document being edited (hidden; restored on restart)

Nothing is sent to the cloud. Your documents are always your own files.

---

## Contributing

This Next.js version includes breaking changes that differ from the standard
release. Before writing code, read [`AGENTS.md`](AGENTS.md) and the relevant guide
under `node_modules/next/dist/docs/`.
