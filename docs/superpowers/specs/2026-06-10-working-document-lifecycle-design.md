# Working / Kura / Stash document lifecycle

Date: 2026-06-10
Status: Approved (design); pending implementation plan

## Context

After the "Drafts removal", every document autosaves to the workspace root and
shows in Kura ("everything is Saved"). This caused friction the user wants to
reverse:

- Opening an empty Zen doc and leaving (the editor blur flush) created an empty
  `Untitled` in Kura.
- More fundamentally: the user wants **nothing to reach Kura unless the `save`
  command is run**. Kura should be the deliberate archive; Zen should be a
  scratchpad; Stash should be temporary holding.

Target lifecycles (from the user):

1. Zen で書く → **save** → Kura に保存
2. Zen で書く → **stash** → Stash に一時保存
3. Zen で書く → stash → (Stash) → Stash から取り出し更新 → **save** → Kura に保存
4. Kura から取り出し更新 → **stash** → Stash に一時保存（**Kura には存在しない**）

## Model: three locations

| Location | Path | Holds | Listed in |
|---|---|---|---|
| **Working** (Zen) | `.work/` (hidden) | the single document being edited | nowhere |
| **Kura** | workspace root `*.md` | only `save`d documents | Kura page, palette, search |
| **Stash** | `.stash/*.md` | `stash`ed (temporary) documents | Stash menu |

- `.work/` is dot-prefixed, so it is naturally excluded from Kura listing
  (`list_markdown_files` skips dotfiles and only scans root) and from search
  (`search_documents` scans root, skip_hidden). **No Rust change expected** —
  reuse the existing `ws_write` / `ws_read` / `ws_delete` / `ws_rename`
  primitives with `.work/<name>.md` paths (the same way `.stash/` is built in
  the front-end today). Implementation must confirm `path_safety` allows the
  `.work/` subfolder (it already allows `.stash/`).

### Document identity

A document has a stable `id` (in its filename `<title>_<id>.md`). The id is the
link across locations — there is **no separate persisted `origin` field**.
Move-commands clean up other-location copies **by id** (see below). This avoids
having to persist/sync an origin and is robust to title renames.

## Commands and behavior

- **edit (autosave)** — writes ONLY to `.work/<name>.md`. Never writes to Kura.
  Marks the working doc *dirty*. An empty (untitled + no content) working doc is
  not written (and any existing `.work/` file for it is removed) — same policy as
  the recent empty-doc fix, so empty scratchpads leave nothing behind.
- **save** (⌘S / palette "Save to Kura" / slash) — write the working doc to Kura
  `<title>_<id>.md`. Then remove any **same-id** file from Stash, and any
  same-id file in Kura at a *different* name (cleans up a stash source that
  graduated, and an old filename after a title change). The doc **stays open in
  Zen** and continues as the working doc (further edits are unsaved until the
  next save). Clears *dirty*. → lifecycles #1, #3.
- **stash** — write the working doc to `.stash/<name>`. Then remove any
  **same-id** file from Kura (it moved out → "Kura には存在しない"). **Reset Zen
  to a fresh empty working doc.** → lifecycles #2, #4.
- **open / 取り出し** (Kura row, palette doc, Stash restore) — load that file's
  content as the working doc (copied into `.work/`). **The source file stays in
  place** (Kura/Stash unchanged) until a later save/stash moves it. Clears
  *dirty*. Subject to the displacement rule below.
- **new document** — start a fresh empty working doc. Subject to displacement.

### Displacement (opening/creating another doc while the current is unsaved)

There is one working doc at a time. When an action would replace it (open
another / new):

- If the current working doc is **dirty and non-empty**, **auto-stash it** first
  (move to `.stash/`), so no work is lost.
- Otherwise (clean, or empty), discard the working buffer — its source copy, if
  any, is intact in Kura/Stash.

Note: auto-stash uses the same *move* semantics as the explicit stash command,
so it removes the same-id Kura copy. Consequence: if you open a Kura doc, edit
it, and then open another without saving, the edited doc relocates from Kura to
Stash (the latest content is preserved and recoverable from Stash, but it is no
longer in Kura until re-saved). This keeps the "a document has one home" rule
consistent. (Flag for review if a gentler rule is preferred — e.g. keep the
Kura original and stash a copy under a new id.)

## Durability / bootstrap

- The working doc is autosaved to `.work/`, so it **survives app restart and
  Zen↔Kura navigation**. On startup, if `.work/` holds a working doc, **resume
  it**; otherwise start a fresh empty working doc (do NOT auto-open a Kura file).
- Working-doc metadata that is not derivable from the filename (currently none,
  since identity is filename-based and origin is id-derived) is not persisted.
  If implementation finds it needs the *dirty* flag across restart, default a
  resumed working doc to dirty=true (safe: it will be auto-stashed rather than
  silently dropped on displacement).

## What this fixes / changes

- The empty-doc-in-Kura bug is **structurally impossible** (editing never writes
  to Kura).
- Reverses the autosave-to-Kura behavior; existing root files remain as Kura
  ("already saved") documents — **no migration needed**. Pre-existing empty
  `Untitled` files from the old behavior can be deleted by the user.

## Implementation surface (TS-only expected)

- `src/store/workspaceStore.ts` — core rework: `WORK_DIR='.work'`; autosave →
  `.work/`; `saveActive` → Kura + id-based cleanup; `stashActive` → `.stash/` +
  id-based Kura cleanup + reset; `openFile`/`restoreStash` → load to working +
  displacement; `createNew` → displacement; bootstrap resumes `.work/`; keep the
  `forDocId` guard and empty-doc guard.
- `src/components/editor/StashMenu.tsx` — restore = 取り出し (load working, keep
  the stash file) instead of move-to-root.
- `src/app/(app)/kura/page.tsx` — open row = 取り出し (semantics live in the
  store; page largely unchanged).
- `src/components/command/CommandPalette.tsx`, `src/components/editor/slash/items.ts`
  — wording/behavior of Save/Stash/New via the store.
- `src/lib/fs/index.ts` — optional thin helpers for `.work/` paths (or reuse
  `readDocument`/`writeDocument` with `.work/<name>` directly).
- Rust: none expected (verify `.work/` passes `path_safety`).

## Verification

- Store-level unit tests (mocked fs, like `workspaceStore.test.ts`) covering the
  four lifecycles, empty-doc no-op, id-based cleanup on save/stash, and the
  displacement auto-stash.
- `npm test`, `npx tsc --noEmit`, `npm run build`, `cargo test` (if Rust touched).
- Manual: each of the 4 lifecycles; "empty Zen → Kura shows nothing"; quit
  mid-edit → resume; open-from-Kura then navigate away → Kura unchanged.

## Open decisions (resolved)

- Working-doc durability: **hidden `.work/`, resumes on restart** (data-safe).
- Open semantics: **source stays until save/stash moves it**.
- Displacement of an unsaved working doc: **auto-stash** (no data loss).
