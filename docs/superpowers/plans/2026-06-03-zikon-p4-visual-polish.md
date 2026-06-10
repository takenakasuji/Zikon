# Zikon P4 — 見た目の最終仕上げ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 「careful-but-generic な AI製ダークUI」から、静かで distinctive な production-grade の見た目へ。浮遊面のエレベーション、落ち着いた縦リズム、一貫したトークン、lucide アイコン、ライトテーマ、可視フォーカス、テーマ付き確認ダイアログ。

**Architecture:** セマンティックCSSトークン（`var(--*)`）を中心に、dark を基準に light セットを `prefers-color-scheme` ＋ `[data-theme]` で重ねる。テーマは localStorage 永続＋ no-flash インラインスクリプト。アイコンは lucide-react に統一。`window.confirm` を themed alertdialog に置換。

**Tech Stack:** React 19, Tailwind 4 (CSS-first `@theme`), TipTap 3, Zustand, lucide-react (新規), Vitest.

**前提:** P0–P2 完了（データ安全・信頼・入力体験）。`feat/ui-markdown-overhaul` で継続。トースト: `useToastStore`。
**注意（AGENTS.md）:** Next.js 16 カスタム版。`'use client'`・`<head>` インラインスクリプト周りは `node_modules/next/dist/docs/` を確認。

## 設計値（このフェーズの「正」）
ダーク（既存 `:root` を基準に追加）:
- `--popover: #141d38`（本文 #0b1224 より一段明るい浮遊面）
- `--shadow-popover: 0 8px 24px -6px rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.4)`
- `--radius: 8px; --radius-sm: 5px`
- `--on-primary: #0b1224`（薄青 primary 上は濃紺文字＝高コントラスト＆モダン）
- `--muted-foreground` を #8b95b5 → **#9aa4c2**（小サイズの可読性）

ライト（`[data-theme="light"]` と `@media (prefers-color-scheme: light) :root:not([data-theme="dark"])`）:
- `--background:#f7f8fb; --foreground:#1b2333; --muted:#eef1f6; --muted-foreground:#5a6378; --border:#dfe3ec; --accent:#e7ecf6; --primary:#3b6fe0; --selection:rgba(59,111,224,0.18); --code-bg:#f0f2f7; --code-fg:#b3402a; --popover:#ffffff; --on-primary:#ffffff; --shadow-popover:0 8px 24px -8px rgba(20,30,60,0.18), 0 2px 6px rgba(20,30,60,0.10)`

---

## File Structure
| File | 役割 |
|---|---|
| `src/app/globals.css` (改修) | エレベーション/サーフェス/角丸/on-primary トークン、縦リズム、見出し余白、引用、コードブロック枠、focus-visible、ライトトークン、light シンタックスパレット |
| `src/components/editor/BubbleMenuBar.tsx` / `slash/SlashMenu.tsx` / `StashMenu.tsx` / `ui/Toaster.tsx` (改修) | 浮遊面に `--popover` 背景＋`--shadow-popover` を適用 |
| `src/store/themeStore.ts` (新規) | テーマ状態（'system'|'light'|'dark'）＋localStorage永続＋DOM適用 |
| `src/store/themeStore.test.ts` (新規) | テーマ store テスト |
| `src/components/layout/ThemeToggle.tsx` (新規) | サイドバーのテーマ切替 |
| `src/app/layout.tsx` (改修) | no-flash インラインスクリプト（描画前に data-theme 設定） |
| `src/components/layout/Sidebar.tsx` (改修) | active状態の明確化、ThemeToggle 設置、アイコン |
| `src/components/ui/ConfirmDialog.tsx` (新規) | themed alertdialog（focusトラップ/Esc/Enter） |
| `src/store/confirmStore.ts` (新規) | confirm() 置換用の Promise ベース確認 store |
| `src/store/confirmStore.test.ts` (新規) | confirm store テスト |
| `src/app/(app)/kura/page.tsx` / `src/components/editor/StashMenu.tsx` (改修) | window.confirm → confirm store |
| `src/components/editor/slash/items.ts` / `BubbleMenuBar.tsx` / `Sidebar.tsx` (改修) | lucide アイコン |
| `package.json` | `lucide-react` 追加 |

---

## Task 1: コアトークン（エレベーション・サーフェス・角丸・on-primary）＋浮遊面適用

**Files:** Modify `src/app/globals.css`, `BubbleMenuBar.tsx`, `slash/SlashMenu.tsx`, `StashMenu.tsx`, `ui/Toaster.tsx`.

- [ ] **Step 1: トークン追加** — `globals.css` の `:root` に追加（既存変数は残す。`--muted-foreground` のみ #9aa4c2 に更新）:
```css
  --popover: #141d38;
  --on-primary: #0b1224;
  --shadow-popover: 0 8px 24px -6px rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.4);
  --radius: 8px;
  --radius-sm: 5px;
```
`@theme inline` ブロックに `--color-popover: var(--popover);` を追加（Tailwind から `bg-popover` 等が使えるよう。任意）。

- [ ] **Step 2: 浮遊面に適用** — 以下のコンポーネントで、浮遊コンテナの `bg-[var(--background)]` を `bg-[var(--popover)]` に、`shadow-lg` を `shadow-[var(--shadow-popover)]` に置換:
  - `BubbleMenuBar.tsx`（BubbleMenu の className）
  - `slash/SlashMenu.tsx`（リスト container と「該当なし」チップ）
  - `StashMenu.tsx`（ドロップダウン container）
  - `ui/Toaster.tsx`（各トーストの `bg-[var(--muted)]` → `bg-[var(--popover)]`、`shadow-lg` → `shadow-[var(--shadow-popover)]`）

- [ ] **Step 3: 検証** — `npx tsc --noEmit`、`npx vitest run`、`npm run build`。
- [ ] **Step 4: コミット** — `git commit -am "feat(ui): elevation + raised-surface + radius tokens; apply to floating surfaces"`

---

## Task 2: 編集面の縦リズム・見出し余白・引用・コードブロック枠

**Files:** Modify `src/app/globals.css`（`.ProseMirror` 配下）。

- [ ] **Step 1: リズム** — クリックアフォーダンスの padding と実リズムを分離:
  - `.ProseMirror > * + *` の `margin-top` を `0.25em` → `0.6em`。
  - `.ProseMirror p` の `padding: 3px 2px` → `padding: 1px 2px`（縦パディングを削減し、段落間は margin で確保）。
- [ ] **Step 2: 見出し余白** — h1/h2/h3 を一貫した比率に:
  - h1 `margin: 1.4em 0 0.4em`、h2 `margin: 1.1em 0 0.35em`、h3 `margin: 0.9em 0 0.3em`。
  - h2 にも `letter-spacing: -0.01em` を追加。
- [ ] **Step 3: 引用** — faded をやめ、border＋淡tint＋本文色に:
  - `blockquote` の `color` を `--muted-foreground` → `var(--foreground)`、`background` に `color-mix(in srgb, var(--primary) 8%, transparent)`、`padding: 0.4em 1em`、左 border は維持。
- [ ] **Step 4: コードブロック枠** — `pre` に `border: 1px solid var(--border)`。インラインコードの `--code-fg`（coral）はそのまま（ブランドアクセント）。
- [ ] **Step 5: 検証** — `npx tsc --noEmit`、`npx vitest run`、`npm run build`。目視は手動検証で。
- [ ] **Step 6: コミット** — `git commit -am "feat(editor): calmer vertical rhythm, scaled heading spacing, callout-style quote, bordered code block"`

---

## Task 3: 可視フォーカス（focus-visible）＋ primary ボタンの on-primary

**Files:** Modify `src/app/globals.css`、`kura/page.tsx`、`welcome/page.tsx`。

- [ ] **Step 1: グローバル focus-visible** — `globals.css` に追加（`.ProseMirror` の `outline:none` は維持＝キャレットで分かるため）:
```css
:where(button, a, [tabindex], input, textarea, [role="button"]):focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}
```
- [ ] **Step 2: primary ボタンの文字色** — Kura/Welcome の `bg-[var(--primary)] ... text-white` を `text-[var(--on-primary)]` に置換し、`hover:opacity-90` は維持（or `hover:brightness-110`）。対象: `kura/page.tsx`（新規作成ボタン×2）、`welcome/page.tsx`（フォルダ選択）、`page.tsx`（再試行ボタン: P1 で `text-[var(--background)]` 使用→`text-[var(--on-primary)]` に統一）。
- [ ] **Step 3: 検証＆コミット** — `npx tsc --noEmit`/`vitest`/`build`。`git commit -am "feat(a11y): global focus-visible ring; on-primary token for CTAs"`

---

## Task 4: ライトテーマ（OS追従＋手動トグル・no-flash）

**Files:** Create `src/store/themeStore.ts`, `src/store/themeStore.test.ts`, `src/components/layout/ThemeToggle.tsx`; Modify `src/app/globals.css`, `src/app/layout.tsx`, `src/components/layout/Sidebar.tsx`.

- [ ] **Step 1: テーマ store（TDD）** — `themeStore.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useThemeStore } from './themeStore'
beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute('data-theme'); useThemeStore.setState({ theme: 'system' }) })
describe('themeStore', () => {
  it('setTheme persists and applies data-theme for explicit themes', () => {
    useThemeStore.getState().setTheme('light')
    expect(useThemeStore.getState().theme).toBe('light')
    expect(localStorage.getItem('zikon-theme')).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })
  it('system removes the data-theme attribute (falls back to prefers-color-scheme)', () => {
    useThemeStore.getState().setTheme('dark')
    useThemeStore.getState().setTheme('system')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(localStorage.getItem('zikon-theme')).toBe('system')
  })
})
```
`themeStore.ts`:
```ts
'use client'
import { create } from 'zustand'

export type Theme = 'system' | 'light' | 'dark'
const KEY = 'zikon-theme'

function apply(theme: Theme) {
  if (typeof document === 'undefined') return
  if (theme === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', theme)
}

function load(): Theme {
  if (typeof localStorage === 'undefined') return 'system'
  const v = localStorage.getItem(KEY)
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
}

interface ThemeState {
  theme: Theme
  setTheme: (t: Theme) => void
  init: () => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: 'system',
  setTheme: (t) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, t)
    apply(t)
    set({ theme: t })
  },
  init: () => {
    const t = load()
    apply(t)
    set({ theme: t })
  },
}))
```

- [ ] **Step 2: ライトトークン＋lightシンタックス** — `globals.css`。`:root` 直後に light セットを追加。**dark を基準**にし、light は明示トグルと OS 追従の両方で適用:
```css
:root[data-theme='light'] { /* 上記「設計値」のライト変数一式 */ }
@media (prefers-color-scheme: light) {
  :root:not([data-theme='dark']) { /* 同じライト変数一式 */ }
}
```
`color-scheme: dark;`（5行目）を `color-scheme: light dark;` に変更（OS追従でフォーム等が適切に）。
light 用のシンタックスハイライト（`:root[data-theme='light']` と `@media(prefers-color-scheme:light) :root:not([data-theme='dark'])` の配下に、`.hljs-keyword` 等の暗色版を上書き。例: comment #8a96a3、keyword #8a3ffc、string #0b7a3b、title #1f5fd0、number/literal #b3402a、type #946800 等の濃色）。**重複を避けるため共通のライト宣言を 1 箇所にまとめる**（CSS の `@media` と属性セレクタで同じ変数群を二重定義するのは許容するが、シンタックス色はクラスにまとめる）。

- [ ] **Step 3: no-flash スクリプト** — `src/app/layout.tsx` の `<html>` 内 `<head>`（無ければ `<head>` を追加）に、描画前に data-theme を設定する最小スクリプトを `dangerouslySetInnerHTML` で:
```tsx
        <head>
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){try{var t=localStorage.getItem('zikon-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
            }}
          />
        </head>
```
（Next 16 app router の RootLayout で `<head>` を明示。既存の `<html>`/`<body>` 構造は維持。）

- [ ] **Step 4: ThemeToggle ＋ init** — `ThemeToggle.tsx`: 3状態（system/light/dark）を循環するボタン（lucide の Sun/Moon/Monitor を Task 5 で差し替え。まずはテキスト or 簡易記号でも可）。マウント時に `useThemeStore.getState().init()` を呼ぶ `useEffect`。Sidebar フッタ付近に設置。
- [ ] **Step 5: 検証** — `themeStore.test.ts` PASS、`vitest`/`tsc`/`build` 緑。jsdom で localStorage/document が使える前提（vitest environment は jsdom）。
- [ ] **Step 6: コミット** — `git commit -am "feat(theme): light theme with OS-follow + manual toggle (no-flash)"`

---

## Task 5: lucide アイコン統一

**Files:** `package.json`（`lucide-react` 追加）、`slash/items.ts`、`BubbleMenuBar.tsx`、`Sidebar.tsx`、`ThemeToggle.tsx`、必要なら `slash/SlashMenu.tsx`。

- [ ] **Step 1: 依存追加** — `npm i lucide-react`。
- [ ] **Step 2: スラッシュの絵文字を置換** — `items.ts` の `icon` を、絵文字（💾 ⇣ “” —）を含め lucide 由来に統一する方針。`SlashItem.icon` を `string`（現状）から React 要素を許容する形に変更するのが大きいので、**最小変更**として: `icon` フィールドはそのまま文字グリフを使い続けるが、絵文字だけを単色グリフへ（💾→記号、⇣→記号、“”→" 、—→—）。**もしくは** `icon` を `LucideIcon` コンポーネント参照に変更し、SlashMenu のアイコンチップで `<Icon size={14}/>` をレンダリング（推奨・より一貫）。推奨案を採用する場合:
  - `items.ts`: `import { Type, Heading1, Heading2, Heading3, List, ListOrdered, ListChecks, Quote, Code, Minus, Save, Archive } from 'lucide-react'`。`SlashItem.icon: LucideIcon`（`import type { LucideIcon } from 'lucide-react'`）。各項目の icon をコンポーネントに。
  - `SlashMenu.tsx`: アイコンチップ内を `{(() => { const Icon = item.icon; return <Icon size={14} /> })()}` に。
- [ ] **Step 3: バブルメニュー** — B/I/S/code/リンク/クリア/H1-3 を lucide（`Bold, Italic, Strikethrough, Code, Link, RemoveFormatting, Heading1..3`）に。リンク編集の「適用/解除」はテキストのままで可。
- [ ] **Step 4: サイドバー＋テーマトグル** — Sidebar の Zen/Kura に lucide（`PenLine`/`Archive` 等）、ThemeToggle に `Sun/Moon/Monitor`。
- [ ] **Step 5: 検証＆コミット** — `tsc`/`vitest`/`build`。`git commit -am "feat(ui): unify icons with lucide (slash/bubble/sidebar/theme)"`

---

## Task 6: テーマ付き確認ダイアログ（window.confirm 置換）

**Files:** Create `src/store/confirmStore.ts`, `src/store/confirmStore.test.ts`, `src/components/ui/ConfirmDialog.tsx`; Modify `src/app/(app)/layout.tsx`（ConfirmDialog 常駐）、`kura/page.tsx`、`StashMenu.tsx`。

- [ ] **Step 1: confirm store（TDD）** — Promise ベース。`confirmStore.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useConfirmStore } from './confirmStore'
beforeEach(() => useConfirmStore.setState({ request: null }))
describe('confirmStore', () => {
  it('confirm() opens a request and resolves true on accept', async () => {
    const p = useConfirmStore.getState().confirm({ message: 'delete?' })
    expect(useConfirmStore.getState().request).not.toBeNull()
    useConfirmStore.getState().resolve(true)
    await expect(p).resolves.toBe(true)
    expect(useConfirmStore.getState().request).toBeNull()
  })
  it('resolves false on cancel', async () => {
    const p = useConfirmStore.getState().confirm({ message: 'x' })
    useConfirmStore.getState().resolve(false)
    await expect(p).resolves.toBe(false)
  })
})
```
`confirmStore.ts`:
```ts
'use client'
import { create } from 'zustand'

interface ConfirmRequest { message: string; confirmLabel?: string; cancelLabel?: string }
interface ConfirmState {
  request: ConfirmRequest | null
  _resolve: ((v: boolean) => void) | null
  confirm: (req: ConfirmRequest) => Promise<boolean>
  resolve: (v: boolean) => void
}
export const useConfirmStore = create<ConfirmState>((set, get) => ({
  request: null,
  _resolve: null,
  confirm: (req) => new Promise<boolean>((resolve) => set({ request: req, _resolve: resolve })),
  resolve: (v) => {
    const r = get()._resolve
    set({ request: null, _resolve: null })
    r?.(v)
  },
}))
```
- [ ] **Step 2: ConfirmDialog** — `ui/ConfirmDialog.tsx`: `request` を購読し、`role="alertdialog"` `aria-modal` のオーバーレイ＋カード。確認/キャンセルボタン、Esc=cancel、Enter=confirm、開いたら確認ボタンに focus（focusトラップは最小: オーバーレイ内に2ボタンのみ）。テーマトークン使用。`(app)/layout.tsx` に `<ConfirmDialog />` 常駐（Toaster の隣）。
- [ ] **Step 3: 置換** — `kura/page.tsx` の `handleDelete` と `StashMenu.tsx` の `handleDelete` の `confirm(...)` を `await useConfirmStore.getState().confirm({ message: \`「${title||'無題'}」を削除しますか？\`, confirmLabel: '削除', cancelLabel: 'キャンセル' })` に置換（true のときのみ削除）。`window.confirm` が src から消えること。
- [ ] **Step 4: 検証＆コミット** — `confirmStore.test.ts` PASS、`tsc`/`vitest`/`build`。`git commit -am "feat(ui): themed confirm dialog replacing window.confirm"`

---

## Task 7: 仕上げ（サイドバーactive・空状態・微アニメ）

**Files:** `Sidebar.tsx`、`kura/page.tsx`・`StashMenu.tsx`・`slash/SlashMenu.tsx`（空状態）、`globals.css`（アニメ）、`StashMenu.tsx`（ドロップダウンの enter）。

- [ ] **Step 1: サイドバー active** — active な nav に左 2px の primary インジケータ（`border-l-2 border-[var(--primary)]` ＋ paddingで位置調整、or 疑似要素）＋ 文字色を foreground に。hover と明確に差を付ける。
- [ ] **Step 2: 空状態の統一** — Stash 空（'Stashはありません'）と slash 「該当なし」に、lucide の小アイコン＋淡い文言を付与し、Kura 空状態とトーンを合わせる（簡素でよい）。
- [ ] **Step 3: 微アニメ** — `globals.css` に 120–150ms の fade+scale キーフレームを定義し、StashMenu ドロップダウンと ConfirmDialog のオーバーレイに適用（`animation`）。スラッシュ/バブルは tippy/floating 制御のため、可能なら CSS で `[data-state]`/mount時クラスに付与（難しければスコープ外メモ）。
- [ ] **Step 4: 検証＆コミット** — `tsc`/`vitest`/`build`。`git commit -am "feat(ui): clearer sidebar active state, consistent empty states, subtle popover animation"`

---

## Task 8: 統合検証

- [ ] **Step 1: 全自動** — `npx vitest run`（全PASS）、`npx tsc --noEmit`（clean）、`npm run build`（成功）、`cd src-tauri && cargo test`（回帰確認）。
- [ ] **Step 2: 手動（`npm run tauri:dev`）** — (1) ダーク/ライト切替がトグルで効き、再起動後も保持・初回フラッシュなし。(2) 浮遊面（スラッシュ/バブル/Stash/トースト）に影と一段明るい面が見える。(3) Tab で可視フォーカスリング。(4) 削除がテーマ付きダイアログ（OSダイアログが出ない）。(5) 編集面の行間・見出し余白が落ち着いて見える。(6) アイコンが絵文字でなく単色で統一。(7) `window.confirm`/`window.prompt` が一切出ない。
- [ ] **Step 3: 完了** — `git log --oneline main..HEAD | cat`。整理は superpowers:finishing-a-development-branch。

---

## Self-Review（spec §5 P4 + A11y 充足チェック — 著者実施済み）
- 浮遊面エレベーション＋サーフェストークン = Task 1。✅
- 縦リズム・見出し余白・引用・コードブロック枠 = Task 2。✅
- 角丸トークン = Task 1。✅
- focus-visible 全体 ＋ on-primary = Task 3。✅
- ライトテーマ（OS追従＋トグル・no-flash・lightシンタックス）= Task 4。✅
- lucide アイコン統一 = Task 5。✅
- テーマ付き confirm ダイアログ（window.confirm 置換）= Task 6。✅
- サイドバーactive・空状態・微アニメ = Task 7。✅

**スコープ外（後続）**: フォーカスモード/タイプライタースクロール、ARIA の網羅的付与（aria-label は要所のみ Task で触れるが完全網羅は別途）、画像assets、ハイライト、検索/パレット（P3）。

**Type consistency**: `themeStore`('system'|'light'|'dark')、`confirmStore`(Promise<boolean>)。`SlashItem.icon` を lucide 採用時は `LucideIcon` に型変更し SlashMenu のレンダリングも合わせる（Task 5 内で一貫）。新トークンは dark/light 両方で定義（`--popover`/`--on-primary`/`--shadow-popover`/`--radius`）。
