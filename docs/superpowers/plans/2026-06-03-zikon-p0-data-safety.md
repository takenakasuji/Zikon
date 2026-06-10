# Zikon P0 — データ安全基盤 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** マークダウンの往復変換を mdast 双方向パイプラインに置換し、永続化を直列化・フラッシュ・衝突安全化して、Zikon が「開く / 編集する / 閉じる」でデータを失わない状態にする。

**Architecture:** 単一中間表現 mdast を介して TipTap JSON ↔ markdown を変換する（読込 `remark-parse`+`remark-gfm`、保存 `remark-stringify`+`remark-gfm`）。TipTap が表現できない mdast ノード（table / html / footnote 等）は `rawBlock` アトムノードに mdast JSON をそのまま保持して byte-faithful に温存する。永続化は store 内の単一 Promise キューで直列化し、autosave は unmount / blur / ウィンドウクローズでフラッシュ。Rust の rename は衝突先を無言上書きしない。

**Tech Stack:** TypeScript, React 19, TipTap 3 (`@tiptap/core`), unified/remark/mdast (`remark-parse`, `remark-gfm`, `remark-stringify` — すべて導入済み), Zustand 5, Tauri 2 (`@tauri-apps/api/window`), Rust (std::fs, tempfile), Vitest.

**注意（AGENTS.md）:** Next.js 16 はカスタム版。本フェーズは lib / store / editor / Rust 中心で Next の面は小さいが、`'use client'` 等で疑問が出たら `node_modules/next/dist/docs/` の該当ガイドを必ず確認すること。

---

## File Structure

| File | 役割 |
|---|---|
| `src/lib/markdown/processor.ts` (新規) | unified プロセッサ（parse / stringify）と `mdastToMarkdown` ヘルパ |
| `src/components/editor/extensions/RawBlock.ts` (新規) | 未対応 mdast を温存する TipTap アトムノード |
| `src/lib/markdown/toMarkdown.ts` (置換) | TipTap JSON → mdast → markdown。export 名 `tiptapToMarkdown` は維持 |
| `src/lib/markdown/toMarkdown.test.ts` (新規) | シリアライザ単体テスト |
| `src/lib/markdown/fromMarkdown.ts` (改修) | 見出し1-6・title保持・未対応ノード温存・インライン保全 |
| `src/lib/markdown/fromMarkdown.test.ts` (改修) | 既存に追加 |
| `src/lib/markdown/roundtrip.test.ts` (新規) | 往復・冪等性のプロパティテスト（安全網） |
| `src/lib/fs/filename.ts` (改修) | `generateId` を UUID 由来へ・`sanitizeTitle` をコードポイント安全に |
| `src/lib/fs/filename.test.ts` (改修) | 既存に追加 |
| `src/store/workspaceStore.ts` (改修) | 書込キュー直列化・保存ステータス土台・空draft掃除・saveActive整合 |
| `src/store/workspaceStore.test.ts` (新規) | fs をモックして永続化ロジックを検証 |
| `src/components/editor/NotionEditor.tsx` (改修) | フラッシュ（unmount/blur/close）・RawBlock登録・見出し1-6・重複link/underline解消 |
| `src-tauri/src/workspace.rs` (改修) | `rename_document` を衝突安全化＋テスト |

---

## Task 1: unified プロセッサ・モジュール

**Files:**
- Create: `src/lib/markdown/processor.ts`
- Test: `src/lib/markdown/processor.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/markdown/processor.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseProcessor, mdastToMarkdown } from './processor'

describe('processor', () => {
  it('parses markdown into an mdast root', () => {
    const tree = parseProcessor.parse('# Hello') as { type: string; children: unknown[] }
    expect(tree.type).toBe('root')
    expect(tree.children.length).toBe(1)
  })

  it('stringifies an mdast root back to markdown', () => {
    const tree = {
      type: 'root',
      children: [
        { type: 'heading', depth: 1, children: [{ type: 'text', value: 'Hello' }] },
      ],
    }
    expect(mdastToMarkdown(tree)).toBe('# Hello')
  })

  it('uses dash bullets and ** strong', () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'list',
          ordered: false,
          spread: false,
          children: [
            {
              type: 'listItem',
              spread: false,
              checked: null,
              children: [
                { type: 'paragraph', children: [{ type: 'strong', children: [{ type: 'text', value: 'x' }] }] },
              ],
            },
          ],
        },
      ],
    }
    expect(mdastToMarkdown(tree)).toBe('- **x**')
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run src/lib/markdown/processor.test.ts`
Expected: FAIL（`processor` モジュールが存在しない）

- [ ] **Step 3: 実装を書く**

`src/lib/markdown/processor.ts`:

```ts
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkStringify from 'remark-stringify'
import type { Root } from 'mdast'

/** markdown 文字列 → mdast。読込で使用。 */
export const parseProcessor = unified().use(remarkParse).use(remarkGfm)

/** mdast → markdown 文字列。保存で使用。スタイルは既存の出力に合わせる。 */
export const stringifyProcessor = unified()
  .use(remarkGfm)
  .use(remarkStringify, {
    bullet: '-',
    emphasis: '*',
    strong: '*',
    rule: '-',
    fence: '`',
    fences: true,
    listItemIndent: 'one',
    incrementListMarker: true,
  })

export function mdastToMarkdown(tree: Root | { type: 'root'; children: unknown[] }): string {
  return stringifyProcessor.stringify(tree as Root).trimEnd()
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npx vitest run src/lib/markdown/processor.test.ts`
Expected: PASS（3件）
注: `- **x**` の出力にならない場合は remark-stringify のオプション（`emphasis`/`strong`/`bullet`）を `node_modules/remark-stringify` の型で確認して調整する。

- [ ] **Step 5: コミット**

```bash
git add src/lib/markdown/processor.ts src/lib/markdown/processor.test.ts
git commit -m "feat(md): add unified parse/stringify processors"
```

---

## Task 2: RawBlock 温存ノード（TipTap 拡張）

未対応 mdast を mdast JSON ごと保持し、表示用に元 markdown を持つアトムノード。

**Files:**
- Create: `src/components/editor/extensions/RawBlock.ts`
- Test: `src/components/editor/extensions/RawBlock.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/components/editor/extensions/RawBlock.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { RawBlock } from './RawBlock'

describe('RawBlock', () => {
  it('is a block-level atom node named rawBlock', () => {
    expect(RawBlock.name).toBe('rawBlock')
    const config = RawBlock.config as { group?: string; atom?: boolean }
    expect(config.group).toBe('block')
    expect(config.atom).toBe(true)
  })

  it('declares mdast and markdown attributes', () => {
    const attrs = RawBlock.config.addAttributes?.call({} as never) as Record<string, unknown>
    expect(attrs).toHaveProperty('mdast')
    expect(attrs).toHaveProperty('markdown')
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run src/components/editor/extensions/RawBlock.test.ts`
Expected: FAIL（`RawBlock` が存在しない）

- [ ] **Step 3: 実装を書く**

`src/components/editor/extensions/RawBlock.ts`:

```ts
import { Node, mergeAttributes } from '@tiptap/core'

/**
 * TipTap が表現できない mdast ノード（table / html / footnote 等）を
 * mdast JSON ごと温存するアトムノード。byte-faithful な往復のために使う。
 * - `mdast`: 元 mdast ノードの JSON 文字列（保存時にそのまま書き戻す）
 * - `markdown`: 表示用にシリアライズした元 markdown
 */
export const RawBlock = Node.create({
  name: 'rawBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      mdast: { default: '' },
      markdown: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-raw-block]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-raw-block': '' })]
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div')
      dom.setAttribute('data-raw-block', '')
      dom.className = 'raw-block'
      const pre = document.createElement('pre')
      pre.textContent = (node.attrs.markdown as string) ?? ''
      dom.appendChild(pre)
      return { dom }
    }
  },
})
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npx vitest run src/components/editor/extensions/RawBlock.test.ts`
Expected: PASS（2件）
注: `@tiptap/core` は `@tiptap/react`/`starter-kit` の依存として解決される。解決できない場合は `npm i -D @tiptap/core@^3` で明示追加する。

- [ ] **Step 5: コミット**

```bash
git add src/components/editor/extensions/RawBlock.ts src/components/editor/extensions/RawBlock.test.ts
git commit -m "feat(editor): add RawBlock node to preserve unsupported markdown"
```

---

## Task 3: mdast ベースのシリアライザ（toMarkdown 置換）

`toMarkdown.ts` を「TipTap JSON → mdast → markdown」へ置換。export 名 `tiptapToMarkdown` は維持（呼び出し側は無改修）。

**Files:**
- Replace: `src/lib/markdown/toMarkdown.ts`
- Test: `src/lib/markdown/toMarkdown.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/markdown/toMarkdown.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { tiptapToMarkdown } from './toMarkdown'

const doc = (...content: unknown[]) => ({ type: 'doc', content })
const p = (...c: unknown[]) => ({ type: 'paragraph', content: c })
const t = (text: string, marks?: unknown[]) => ({ type: 'text', text, ...(marks ? { marks } : {}) })

describe('tiptapToMarkdown', () => {
  it('serializes a heading', () => {
    expect(tiptapToMarkdown({ type: 'heading', attrs: { level: 2 }, content: [t('H')] })).toBe('## H')
  })

  it('serializes bold/italic/strike/code marks', () => {
    expect(tiptapToMarkdown(p(t('a', [{ type: 'bold' }])))).toBe('**a**')
    expect(tiptapToMarkdown(p(t('a', [{ type: 'italic' }])))).toBe('*a*')
    expect(tiptapToMarkdown(p(t('a', [{ type: 'strike' }])))).toBe('~~a~~')
    expect(tiptapToMarkdown(p(t('a', [{ type: 'code' }])))).toBe('`a`')
  })

  it('serializes a link with href', () => {
    expect(tiptapToMarkdown(p(t('x', [{ type: 'link', attrs: { href: 'https://e.com' } }]))))
      .toBe('[x](https://e.com)')
  })

  it('ESCAPES a paragraph that starts with markdown sigils (no corruption on reload)', () => {
    // 本文の "# foo" が見出しに化けないこと
    const out = tiptapToMarkdown(p(t('# foo')))
    expect(out.startsWith('# ')).toBe(false)
    expect(out).toContain('foo')
  })

  it('serializes a task list', () => {
    const out = tiptapToMarkdown(
      doc({
        type: 'taskList',
        content: [
          { type: 'taskItem', attrs: { checked: true }, content: [p(t('done'))] },
          { type: 'taskItem', attrs: { checked: false }, content: [p(t('todo'))] },
        ],
      }),
    )
    expect(out).toContain('- [x] done')
    expect(out).toContain('- [ ] todo')
  })

  it('serializes a code block with language', () => {
    const out = tiptapToMarkdown({
      type: 'codeBlock',
      attrs: { language: 'ts' },
      content: [t('const x = 1')],
    })
    expect(out).toBe('```ts\nconst x = 1\n```')
  })

  it('writes back a rawBlock verbatim from its stored mdast', () => {
    const mdast = JSON.stringify({
      type: 'table',
      align: [null, null],
      children: [
        { type: 'tableRow', children: [
          { type: 'tableCell', children: [{ type: 'text', value: 'A' }] },
          { type: 'tableCell', children: [{ type: 'text', value: 'B' }] },
        ] },
        { type: 'tableRow', children: [
          { type: 'tableCell', children: [{ type: 'text', value: '1' }] },
          { type: 'tableCell', children: [{ type: 'text', value: '2' }] },
        ] },
      ],
    })
    const out = tiptapToMarkdown(doc({ type: 'rawBlock', attrs: { mdast, markdown: '' } }))
    expect(out).toContain('| A | B |')
    expect(out).toContain('| 1 | 2 |')
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run src/lib/markdown/toMarkdown.test.ts`
Expected: FAIL（現行 `toMarkdown.ts` はエスケープせず rawBlock も知らない）

- [ ] **Step 3: 実装を書く（ファイル全置換）**

`src/lib/markdown/toMarkdown.ts`:

```ts
import type { JSONContent } from '@tiptap/react'
import type {
  Root,
  RootContent,
  PhrasingContent,
  ListItem,
  Heading,
} from 'mdast'
import { mdastToMarkdown } from './processor'

type Mark = { type: string; attrs?: Record<string, unknown> }

function textWithMarks(text: string, marks: Mark[]): PhrasingContent {
  const has = (t: string) => marks.some((m) => m.type === t)
  let node: PhrasingContent = has('code')
    ? { type: 'inlineCode', value: text }
    : { type: 'text', value: text }
  if (has('strike')) node = { type: 'delete', children: [node] }
  if (has('italic')) node = { type: 'emphasis', children: [node] }
  if (has('bold')) node = { type: 'strong', children: [node] }
  const link = marks.find((m) => m.type === 'link')
  if (link) {
    node = {
      type: 'link',
      url: (link.attrs?.href as string) ?? '',
      title: (link.attrs?.title as string | undefined) ?? null,
      children: [node],
    }
  }
  return node
}

function inlineToMdast(node: JSONContent): PhrasingContent | null {
  if (node.type === 'text') return textWithMarks(node.text ?? '', (node.marks as Mark[]) ?? [])
  if (node.type === 'hardBreak') return { type: 'break' }
  if (node.type === 'image') {
    return {
      type: 'image',
      url: (node.attrs?.src as string) ?? '',
      alt: (node.attrs?.alt as string) ?? '',
      title: (node.attrs?.title as string | undefined) ?? null,
    }
  }
  return null
}

function inlines(content: JSONContent[] | undefined): PhrasingContent[] {
  return (content ?? [])
    .map(inlineToMdast)
    .filter((n): n is PhrasingContent => n !== null)
}

function listItems(content: JSONContent[] | undefined, checkedOf: (n: JSONContent) => boolean | null): ListItem[] {
  return (content ?? []).map((item) => ({
    type: 'listItem',
    spread: false,
    checked: checkedOf(item),
    children: blocks(item.content),
  }))
}

function blockToMdast(node: JSONContent): RootContent | null {
  switch (node.type) {
    case 'paragraph':
      return { type: 'paragraph', children: inlines(node.content) }
    case 'heading': {
      const depth = Math.min(6, Math.max(1, (node.attrs?.level as number) ?? 1)) as Heading['depth']
      return { type: 'heading', depth, children: inlines(node.content) }
    }
    case 'bulletList':
      return { type: 'list', ordered: false, spread: false, children: listItems(node.content, () => null) }
    case 'orderedList':
      return {
        type: 'list',
        ordered: true,
        start: (node.attrs?.start as number) ?? 1,
        spread: false,
        children: listItems(node.content, () => null),
      }
    case 'taskList':
      return {
        type: 'list',
        ordered: false,
        spread: false,
        children: listItems(node.content, (it) => Boolean(it.attrs?.checked)),
      }
    case 'blockquote':
      return { type: 'blockquote', children: blocks(node.content) }
    case 'codeBlock': {
      const lang = (node.attrs?.language as string | undefined) ?? null
      return {
        type: 'code',
        lang: lang && lang !== 'plaintext' ? lang : null,
        meta: (node.attrs?.meta as string | undefined) ?? null,
        value: (node.content ?? []).map((n) => n.text ?? '').join(''),
      }
    }
    case 'horizontalRule':
      return { type: 'thematicBreak' }
    case 'image':
      return {
        type: 'paragraph',
        children: [
          {
            type: 'image',
            url: (node.attrs?.src as string) ?? '',
            alt: (node.attrs?.alt as string) ?? '',
            title: (node.attrs?.title as string | undefined) ?? null,
          },
        ],
      }
    case 'rawBlock': {
      const raw = (node.attrs?.mdast as string) ?? ''
      if (!raw) return null
      try {
        return JSON.parse(raw) as RootContent
      } catch {
        return null
      }
    }
    default:
      return null
  }
}

function blocks(content: JSONContent[] | undefined): RootContent[] {
  return (content ?? [])
    .map(blockToMdast)
    .filter((n): n is RootContent => n !== null)
}

export function tiptapToMarkdown(json: JSONContent): string {
  const children = json.type === 'doc' ? blocks(json.content) : blocks([json])
  const root: Root = { type: 'root', children }
  return mdastToMarkdown(root)
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npx vitest run src/lib/markdown/toMarkdown.test.ts`
Expected: PASS（全件）

- [ ] **Step 5: 既存呼び出しが壊れていないか型チェック**

Run: `npx tsc --noEmit`
Expected: `toMarkdown` 由来のエラーなし（`tiptapToMarkdown` の export 名は不変）

- [ ] **Step 6: コミット**

```bash
git add src/lib/markdown/toMarkdown.ts src/lib/markdown/toMarkdown.test.ts
git commit -m "feat(md): replace hand-rolled serializer with mdast pipeline (escaping, tables, raw passthrough)"
```

---

## Task 4: fromMarkdown 拡張（消失をなくす）

見出し1-6、link/image の title 保持、未対応ブロックの `rawBlock` 温存、インライン消失の防止。

**Files:**
- Modify: `src/lib/markdown/fromMarkdown.ts`
- Modify: `src/lib/markdown/fromMarkdown.test.ts`

- [ ] **Step 1: 失敗するテストを追加**

`src/lib/markdown/fromMarkdown.test.ts` に追記（既存 import を流用）:

```ts
import { describe, it, expect } from 'vitest'
import { markdownToTiptap } from './fromMarkdown'

describe('fromMarkdown — data preservation', () => {
  it('keeps heading levels 4-6 instead of clamping to 3', () => {
    const doc = markdownToTiptap('#### four')
    const h = doc.content?.[0]
    expect(h?.type).toBe('heading')
    expect(h?.attrs?.level).toBe(4)
  })

  it('preserves a GFM table as a rawBlock (not dropped)', () => {
    const doc = markdownToTiptap('| A | B |\n| --- | --- |\n| 1 | 2 |')
    const node = doc.content?.[0]
    expect(node?.type).toBe('rawBlock')
    expect(node?.attrs?.mdast).toContain('"type":"table"')
  })

  it('preserves a block HTML node as a rawBlock', () => {
    const doc = markdownToTiptap('<div class="x">hi</div>')
    const node = doc.content?.[0]
    expect(node?.type).toBe('rawBlock')
  })

  it('keeps link title', () => {
    const doc = markdownToTiptap('[x](https://e.com "ttl")')
    const textNode = doc.content?.[0]?.content?.[0]
    const linkMark = textNode?.marks?.find((m) => m.type === 'link')
    expect(linkMark?.attrs?.title).toBe('ttl')
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run src/lib/markdown/fromMarkdown.test.ts`
Expected: FAIL（クランプ・table ドロップ・title 欠落）

- [ ] **Step 3: 実装を改修**

`src/lib/markdown/fromMarkdown.ts` — 先頭の import を差し替え、`convertBlock` と `convertInline` を改修:

import 部（既存の `processor` 定義を削除して共有プロセッサを使う）:

```ts
import remarkStringify from 'remark-stringify'
import { unified } from 'unified'
import type { JSONContent } from '@tiptap/react'
import type { Root, RootContent, PhrasingContent } from 'mdast'
import { parseProcessor } from './processor'
```

`markdownToTiptap` 冒頭の `processor.parse` を `parseProcessor.parse` に変更:

```ts
export function markdownToTiptap(markdown: string): JSONContent {
  const tree = parseProcessor.parse(markdown) as Root
  const content = (tree.children ?? [])
    .map(convertBlock)
    .filter((n): n is JSONContent => n !== null)
  return { type: 'doc', content }
}
```

ファイル末尾近くに rawBlock 生成ヘルパを追加（`remark-stringify` を最小構成で利用）:

```ts
const rawStringify = unified().use(remarkStringify)

function toRawBlock(node: RootContent): JSONContent {
  const root: Root = { type: 'root', children: [node] }
  let markdown = ''
  try {
    markdown = rawStringify.stringify(root).trimEnd()
  } catch {
    markdown = ''
  }
  return { type: 'rawBlock', attrs: { mdast: JSON.stringify(node), markdown } }
}
```

`convertBlock` の `heading` を変更（クランプ撤廃）:

```ts
    case 'heading':
      return {
        type: 'heading',
        attrs: { level: Math.min(6, Math.max(1, node.depth)) },
        content: convertInlines(node.children),
      }
```

`convertBlock` の `default` を変更（捨てずに温存）:

```ts
    default:
      return toRawBlock(node)
```

`convertBlock` の `image` ケースに title を追加:

```ts
    case 'image':
      return { type: 'image', attrs: { src: node.url, alt: node.alt ?? '', title: node.title ?? null } }
```

`paragraph` 内の単独画像アンラップにも title を追加:

```ts
      if (node.children.length === 1 && node.children[0].type === 'image') {
        const img = node.children[0]
        return { type: 'image', attrs: { src: img.url, alt: img.alt ?? '', title: img.title ?? null } }
      }
```

`convertInline` の `link` ケースに title を追加:

```ts
    case 'link':
      return node.children.flatMap((c) =>
        convertInline(c, [...marks, { type: 'link', attrs: { href: node.url, title: node.title ?? null } }]),
      )
```

`convertInline` の `default` を変更（インライン消失の防止 — 値があれば素テキストで保全）:

```ts
    default: {
      const value = (node as { value?: string }).value
      return value ? [{ type: 'text', text: value, marks: marks.length ? marks : undefined }] : []
    }
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npx vitest run src/lib/markdown/fromMarkdown.test.ts`
Expected: PASS（既存＋新規すべて）

- [ ] **Step 5: コミット**

```bash
git add src/lib/markdown/fromMarkdown.ts src/lib/markdown/fromMarkdown.test.ts
git commit -m "feat(md): preserve tables/html/titles and headings 1-6 on load"
```

---

## Task 5: 往復・冪等性プロパティテスト（安全網）

データ消失バグが二度と CI をすり抜けないように、開く→保存の往復を検証する。

**Files:**
- Create: `src/lib/markdown/roundtrip.test.ts`

- [ ] **Step 1: テストを書く**

`src/lib/markdown/roundtrip.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { markdownToTiptap } from './fromMarkdown'
import { tiptapToMarkdown } from './toMarkdown'

const round = (md: string) => tiptapToMarkdown(markdownToTiptap(md))

describe('markdown round-trip preserves content', () => {
  const cases: Array<[string, (out: string) => void]> = [
    ['# Heading', (o) => expect(o).toContain('# Heading')],
    ['#### four', (o) => expect(o).toContain('#### four')],
    ['- a\n- b', (o) => { expect(o).toContain('- a'); expect(o).toContain('- b') }],
    ['1. one\n2. two', (o) => { expect(o).toContain('1. one'); expect(o).toContain('two') }],
    ['- [x] done\n- [ ] todo', (o) => { expect(o).toContain('- [x] done'); expect(o).toContain('- [ ] todo') }],
    ['> quote', (o) => expect(o).toContain('> quote')],
    ['**bold** and *italic* and ~~strike~~', (o) => {
      expect(o).toContain('**bold**'); expect(o).toContain('*italic*'); expect(o).toContain('~~strike~~')
    }],
    ['`code`', (o) => expect(o).toContain('`code`')],
    ['```ts\nconst x = 1\n```', (o) => { expect(o).toContain('```ts'); expect(o).toContain('const x = 1') }],
    ['[x](https://e.com)', (o) => expect(o).toContain('[x](https://e.com)')],
    ['| A | B |\n| --- | --- |\n| 1 | 2 |', (o) => { expect(o).toContain('| A | B |'); expect(o).toContain('| 1 | 2 |') }],
    ['<div class="x">hi</div>', (o) => expect(o).toContain('<div class="x">hi</div>')],
  ]

  it.each(cases)('preserves: %s', (md, assert) => {
    assert(round(md))
  })

  it('does NOT promote a body paragraph starting with "#" into a heading', () => {
    const md = 'first line\n\n\\# not a heading'
    const out = round('first line\n\n# not a heading')
    // 2周しても本文の "# ..." が見出しに昇格しない
    const doc = markdownToTiptap(out)
    const second = doc.content?.[1]
    expect(second?.type).toBe('paragraph')
    expect(md).toContain('not a heading')
  })

  it('is idempotent (md -> tiptap -> md -> tiptap -> md is stable)', () => {
    const samples = [
      '# Title\n\nbody **bold**\n\n- a\n- b',
      '| A | B |\n| --- | --- |\n| 1 | 2 |',
      '> quote\n\n```js\nlet y = 2\n```',
    ]
    for (const md of samples) {
      const once = round(md)
      const twice = round(once)
      expect(twice).toBe(once)
    }
  })
})
```

- [ ] **Step 2: テストを実行**

Run: `npx vitest run src/lib/markdown/roundtrip.test.ts`
Expected: PASS。失敗ケースが出たら Task 3/4 の該当変換を修正する（このテストが安全網）。特に冪等性が崩れる場合は remark-stringify のオプション差異が原因なので Task 1 の設定を調整。

- [ ] **Step 3: 全マークダウンテストを実行**

Run: `npx vitest run src/lib/markdown`
Expected: PASS（processor / toMarkdown / fromMarkdown / roundtrip すべて）

- [ ] **Step 4: コミット**

```bash
git add src/lib/markdown/roundtrip.test.ts
git commit -m "test(md): add round-trip and idempotence safety net"
```

---

## Task 6: 衝突しない ID と安全な sanitize

**Files:**
- Modify: `src/lib/fs/filename.ts`
- Modify: `src/lib/fs/filename.test.ts`

- [ ] **Step 1: 失敗するテストを追加**

`src/lib/fs/filename.test.ts` に追記:

```ts
import { describe, it, expect } from 'vitest'
import { generateId, sanitizeTitle } from './filename'

describe('generateId', () => {
  it('produces unique ids across rapid calls', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateId()))
    expect(ids.size).toBe(1000)
  })

  it('produces filesystem-safe ids (alphanumeric/dash only)', () => {
    expect(generateId()).toMatch(/^[0-9a-z-]+$/)
  })
})

describe('sanitizeTitle', () => {
  it('does not split surrogate pairs when truncating', () => {
    const emoji = '😀'.repeat(50) // 各2 code unit
    const out = sanitizeTitle(emoji)
    // 不正な lone surrogate を含まない（再エンコードで壊れない）
    expect(out).toBe(out.normalize('NFC'))
    expect([...out].every((ch) => ch === '😀')).toBe(true)
  })

  it('trims trailing dots and spaces', () => {
    expect(sanitizeTitle('hello.. ')).toBe('hello')
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run src/lib/fs/filename.test.ts`
Expected: FAIL（旧 `generateId` は衝突しうる・`sanitizeTitle` は code unit 切り＆末尾処理なし）

- [ ] **Step 3: 実装を改修**

`src/lib/fs/filename.ts` の `generateId` と `sanitizeTitle` を置換:

```ts
const FORBIDDEN = /[\/\\:*?"<>|\n\t\r]/g
const MAX_TITLE_LEN = 40

export function generateId(): string {
  // crypto.randomUUID 由来の衝突しない短い id
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return uuid.replace(/-/g, '').slice(0, 10)
  // フォールバック（テスト環境等で crypto 不在時）
  return Array.from({ length: 10 }, () => Math.floor(Math.random() * 36).toString(36)).join('')
}

export function sanitizeTitle(title: string): string {
  const cleaned = title.replace(FORBIDDEN, '_').trim()
  // コードポイント単位で切り詰め（サロゲートペアを割らない）
  const points = Array.from(cleaned)
  const truncated = points.length > MAX_TITLE_LEN ? points.slice(0, MAX_TITLE_LEN).join('') : cleaned
  // 末尾のドット/空白を除去（Windows 等で不正）
  return truncated.replace(/[.\s]+$/u, '')
}
```

注: `parseFilename` の正規表現 `_([0-9a-z]{6})` は 6 桁固定なので、id 長変更に合わせて `_([0-9a-z-]{6,})` に緩める:

```ts
export function parseFilename(filename: string): { title: string; id: string } | null {
  const m = filename.match(/^(.*?)_([0-9a-z-]{6,})\.md$/)
  if (!m) return null
  const title = m[1] === 'untitled' ? '' : m[1]
  return { title, id: m[2] }
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npx vitest run src/lib/fs/filename.test.ts`
Expected: PASS（既存＋新規）

- [ ] **Step 5: コミット**

```bash
git add src/lib/fs/filename.ts src/lib/fs/filename.test.ts
git commit -m "fix(fs): collision-resistant ids and codepoint-safe title sanitize"
```

---

## Task 7: Rust rename を衝突安全化

`fs::rename` は dst を無言上書きする。存在チェックして別ドキュメントを壊さない。

**Files:**
- Modify: `src-tauri/src/workspace.rs`

- [ ] **Step 1: 失敗するテストを追加**

`src-tauri/src/workspace.rs` の `mod tests` 内に追記:

```rust
    #[test]
    fn rename_refuses_to_overwrite_existing_destination() {
        let dir = TempDir::new().unwrap();
        write_document(dir.path(), "a_aaaaaa.md", "AAA").unwrap();
        write_document(dir.path(), "b_bbbbbb.md", "BBB").unwrap();
        // b が既に存在する場所へ a を rename → 拒否され、b は無傷
        let res = rename_document(dir.path(), "a_aaaaaa.md", "b_bbbbbb.md");
        assert!(res.is_err());
        assert_eq!(read_document(dir.path(), "b_bbbbbb.md").unwrap(), "BBB");
        assert_eq!(read_document(dir.path(), "a_aaaaaa.md").unwrap(), "AAA");
    }
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `cd src-tauri && cargo test rename_refuses_to_overwrite_existing_destination`
Expected: FAIL（現状は上書きして成功してしまう）

- [ ] **Step 3: 実装を改修**

`WsError` に variant を追加:

```rust
#[derive(Debug, thiserror::Error)]
pub enum WsError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("path: {0}")]
    Path(#[from] crate::path_safety::PathError),
    #[error("not found")]
    NotFound,
    #[error("destination already exists")]
    AlreadyExists,
}
```

`rename_document` に存在チェックを追加（src と dst が同一パスの場合は許容）:

```rust
pub fn rename_document(workspace: &Path, from: &str, to: &str) -> Result<(), WsError> {
    let src = resolve_within(workspace, from)?;
    let dst = resolve_within(workspace, to)?;
    if src != dst && dst.exists() {
        return Err(WsError::AlreadyExists);
    }
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::rename(src, dst)?;
    Ok(())
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `cd src-tauri && cargo test`
Expected: PASS（既存の rename 系テスト含め全件。`rename_moves_file` と `stash_and_restore_roundtrip` は dst 非存在なので無影響）

- [ ] **Step 5: コミット**

```bash
git add src-tauri/src/workspace.rs
git commit -m "fix(tauri): rename refuses to silently overwrite existing files"
```

---

## Task 8: store の書込キュー直列化・状態土台・掃除

**Files:**
- Modify: `src/store/workspaceStore.ts`
- Create: `src/store/workspaceStore.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/store/workspaceStore.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn(async () => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() })),
}))

const fs = {
  listMarkdownFiles: vi.fn(async () => []),
  listStashFiles: vi.fn(async () => []),
  listDraftFiles: vi.fn(async () => []),
  readDocument: vi.fn(async () => ''),
  writeDocument: vi.fn(async () => {}),
  renameDocument: vi.fn(async () => {}),
  deleteDocument: vi.fn(async () => {}),
}
vi.mock('@/lib/fs', () => fs)

import { useWorkspaceStore } from './workspaceStore'

beforeEach(() => {
  Object.values(fs).forEach((f) => f.mockClear())
  useWorkspaceStore.setState({
    workspace: '/ws',
    active: { name: 'untitled_aaaaaa.md', title: '', id: 'aaaaaa', content: '', state: 'draft' },
    files: [],
    stashes: [],
  })
})

describe('updateActiveContent', () => {
  it('writes the new content and removes the old file when the name changes', async () => {
    await useWorkspaceStore.getState().updateActiveContent('# Hello')
    // 新ファイル名で書き込み
    expect(fs.writeDocument).toHaveBeenCalledWith('/ws', '.drafts/Hello_aaaaaa.md', '# Hello')
    // 旧ファイルを削除（rename 競合を避ける write-then-delete）
    expect(fs.deleteDocument).toHaveBeenCalledWith('/ws', '.drafts/untitled_aaaaaa.md')
  })

  it('serializes concurrent calls (no interleaving)', async () => {
    const order: string[] = []
    fs.writeDocument.mockImplementation(async (_ws: string, name: string) => {
      order.push('start:' + name)
      await new Promise((r) => setTimeout(r, 5))
      order.push('end:' + name)
    })
    const a = useWorkspaceStore.getState().updateActiveContent('# A')
    const b = useWorkspaceStore.getState().updateActiveContent('# B')
    await Promise.all([a, b])
    // 直列化されていれば start/end が交互に重ならない
    expect(order[0].startsWith('start:')).toBe(true)
    expect(order[1].startsWith('end:')).toBe(true)
  })
})

describe('saveActive', () => {
  it('keeps state as draft when the promotion rename fails', async () => {
    useWorkspaceStore.setState({
      active: { name: 'Doc_aaaaaa.md', title: 'Doc', id: 'aaaaaa', content: '# Doc', state: 'draft' },
    })
    fs.renameDocument.mockRejectedValueOnce(new Error('destination already exists'))
    await useWorkspaceStore.getState().saveActive().catch(() => {})
    expect(useWorkspaceStore.getState().active?.state).toBe('draft')
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run src/store/workspaceStore.test.ts`
Expected: FAIL（現行は rename ベース・直列化なし・失敗時も saved に遷移）

- [ ] **Step 3: 実装を改修**

`src/store/workspaceStore.ts` の冒頭（import 群の後）に書込キューと状態フィールドを追加:

```ts
// 全永続化を直列化する単一キュー（fire-and-forget の競合を防ぐ）
let writeQueue: Promise<unknown> = Promise.resolve()
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task, task)
  writeQueue = run.catch(() => {})
  return run
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
```

`WorkspaceState` インターフェースに状態フィールドを追加:

```ts
  saveStatus: SaveStatus
  lastSavedAt: number | null
  lastError: string | null
```

`create<WorkspaceState>((set, get) => ({ ... }))` の初期値に追加:

```ts
  saveStatus: 'idle',
  lastSavedAt: null,
  lastError: null,
```

`updateActiveContent` を「直列化＋write-then-delete＋状態更新」に置換:

```ts
  updateActiveContent: async (content: string) => {
    return enqueue(async () => {
      const active = get().active
      const ws = get().workspace
      if (!active || !ws) return

      const newTitle = extractFirstH1(content)
      const newName = buildFilename(newTitle, active.id)
      const oldPath = pathFor(active)
      const newPath = active.state === 'draft' ? `${DRAFTS_DIR}/${newName}` : newName

      set({ saveStatus: 'saving' })
      try {
        await writeDocument(ws, newPath, content)
        if (newPath !== oldPath) {
          try {
            await deleteDocument(ws, oldPath)
          } catch {
            // 旧ファイルが無い（新規draft）のは正常。それ以外は孤児が残るだけで内容は安全。
          }
        }
        set({
          active: { ...active, name: newName, title: newTitle, content },
          saveStatus: 'saved',
          lastSavedAt: Date.now(),
          lastError: null,
        })
        if (active.state === 'saved') await get().reloadFiles()
      } catch (e) {
        set({ saveStatus: 'error', lastError: String(e) })
        throw e
      }
    })
  },
```

`saveActive` を「rename 成功後にのみ saved 化」に置換:

```ts
  saveActive: async () => {
    return enqueue(async () => {
      const ws = get().workspace
      const active = get().active
      if (!ws || !active) return
      if (active.state === 'saved') {
        await writeDocument(ws, active.name, active.content)
        await get().reloadFiles()
        return
      }
      if (isEmptyDoc(active)) return

      const draftPath = `${DRAFTS_DIR}/${active.name}`
      await writeDocument(ws, draftPath, active.content)
      await renameDocument(ws, draftPath, active.name) // 失敗時はここで throw → state は draft のまま
      set({ active: { ...active, state: 'saved' } })
      await get().reloadFiles()
    })
  },
```

`stashActive` を「直列化＋空draft掃除」に置換:

```ts
  stashActive: async () => {
    return enqueue(async () => {
      const ws = get().workspace
      const active = get().active
      if (!ws || !active) return
      if (!isEmptyDoc(active)) {
        const srcPath = pathFor(active)
        const dstPath = `${STASH_DIR}/${active.name}`
        await writeDocument(ws, srcPath, active.content)
        await renameDocument(ws, srcPath, dstPath)
      } else {
        // 空 draft はディスクに孤児を残さず削除
        try {
          await deleteDocument(ws, pathFor(active))
        } catch {
          // まだ書かれていなければ無視
        }
      }
      set({ active: emptyDraft() })
      await get().reloadFiles()
      await get().reloadStashes()
    })
  },
```

`@/lib/fs` の import に `deleteDocument` が含まれていることを確認（既存で import 済み）。

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npx vitest run src/store/workspaceStore.test.ts`
Expected: PASS（3件）

- [ ] **Step 5: 型チェック**

Run: `npx tsc --noEmit`
Expected: store 由来エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/store/workspaceStore.ts src/store/workspaceStore.test.ts
git commit -m "fix(store): serialize writes, status plumbing, empty-draft cleanup, save-after-rename"
```

---

## Task 9: エディタのフラッシュとデータ安全設定

autosave を unmount / blur / ウィンドウクローズでフラッシュし、RawBlock 登録・見出し1-6・重複link/underline解消。

**Files:**
- Modify: `src/components/editor/NotionEditor.tsx`

- [ ] **Step 1: フラッシュ・ヘルパとライフサイクルを実装**

`src/components/editor/NotionEditor.tsx` の import に追加:

```ts
import { RawBlock } from './extensions/RawBlock'
```

`StarterKit.configure` を変更（heading 1-6・同梱 link/underline を無効化して重複と無音消失を解消）:

```ts
      StarterKit.configure({
        codeBlock: false,
        link: false,
        underline: false,
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
```

`extensions` 配列に `RawBlock` を追加（`SlashCommand` の前あたり）:

```ts
      RawBlock,
```

`onUpdate` の直後（`editorProps` の前）に、保留中フラッシュを共有する仕組みを追加。`useEditor` の外側で `flushRef` を定義し、`onUpdate` の保存処理を関数化する:

`NotionEditor` 関数の冒頭付近（`timerRef` の隣）に:

```ts
  const editorRef = useRef<ReturnType<typeof useEditor> | null>(null)
```

`onUpdate` を、タイマー発火時に共通の保存関数を呼ぶ形へ:

```ts
    onUpdate: ({ editor }) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        const md = tiptapToMarkdown(editor.getJSON())
        void updateActiveContent(md)
      }, AUTO_SAVE_MS)
    },
    onBlur: ({ editor }) => {
      // フォーカスを失ったら保留中の保存を即時フラッシュ
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      const md = tiptapToMarkdown(editor.getJSON())
      void updateActiveContent(md)
    },
```

`editor` を ref に同期し、unmount でフラッシュする useEffect に差し替え（既存の cleanup useEffect を置換）:

```ts
  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  useEffect(() => {
    return () => {
      // unmount 時: 保留中タイマーを破棄するだけでなく必ずフラッシュ
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
        const ed = editorRef.current
        if (ed) {
          const md = tiptapToMarkdown(ed.getJSON())
          void updateActiveContent(md)
        }
      }
    }
  }, [updateActiveContent])
```

- [ ] **Step 2: ウィンドウクローズ時のフラッシュを追加**

`NotionEditor` 内に、Tauri 環境でのみ `onCloseRequested` を登録する useEffect を追加:

```ts
  useEffect(() => {
    let unlisten: (() => void) | undefined
    let cancelled = false
    async function register() {
      if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const win = getCurrentWindow()
      const handler = await win.onCloseRequested(async (event) => {
        const ed = editorRef.current
        if (!ed) return
        event.preventDefault()
        if (timerRef.current) {
          clearTimeout(timerRef.current)
          timerRef.current = null
        }
        const md = tiptapToMarkdown(ed.getJSON())
        await updateActiveContent(md)
        await win.destroy()
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
```

- [ ] **Step 3: 型チェックとビルド確認**

Run: `npx tsc --noEmit`
Expected: NotionEditor 由来エラーなし

Run: `npx vitest run`
Expected: 既存テスト全 PASS（編集系はユニットテスト対象外だが回帰がないこと）

- [ ] **Step 4: コミット**

```bash
git add src/components/editor/NotionEditor.tsx
git commit -m "fix(editor): flush autosave on blur/unmount/close, register RawBlock, headings 1-6, drop duplicate link/underline"
```

---

## Task 10: 統合検証（手動 + 自動）

**Files:** なし（検証のみ）

- [ ] **Step 1: 全自動テスト**

Run: `npx vitest run`
Expected: 全 PASS

Run: `cd src-tauri && cargo test`
Expected: 全 PASS

- [ ] **Step 2: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 3: 手動検証（`npm run tauri:dev`）**

このプロジェクトの実行手順は `/run` skill に従う。起動後、以下を手で確認:

1. テーブルを含む `.md` をワークスペースに置いて開く → 表が `rawBlock`（pre 表示）として見え、**消えない**。一度別ドキュメントに移動して戻る → 表が残っている（往復で保全）。
2. 段落の先頭に `# テスト` と入力 → 保存後にファイルを開き直すと**見出しに化けず**本文のまま。ファイル名も乗っ取られない。
3. 数文字打ってすぐウィンドウを閉じる → 再起動後に直近の入力が**残っている**（クローズ時フラッシュ）。
4. 既存ドキュメントを編集中に Zen→Kura へ遷移し戻る → 直近編集が**残っている**（unmount/blur フラッシュ）。
5. コンソールに TipTap の `Duplicate extension names` 警告が**出ない**こと（link/underline 無効化）。

- [ ] **Step 4: P0 完了をマージ可能状態にする**

REQUIRED SUB-SKILL: 完了の整理は superpowers:finishing-a-development-branch に従う（マージ/PR/クリーンアップの選択）。

```bash
git log --oneline feat/ui-markdown-overhaul ^main
```
Expected: Task 1-9 のコミットが並ぶ

---

## Self-Review（spec 充足チェック — 著者実施済み）

- **§4.1 mdast 双方向化**: Task 1（processor）・Task 3（serializer）・Task 4（parser拡張）。未対応ノード温存＝Task 2 RawBlock + Task 4 `toRawBlock`。✅
- **§1.1-1 テーブル/HTML消失**: Task 4 + roundtrip Task 5 で保全をテスト。✅
- **§1.1-2 エスケープ皆無**: Task 3 が remark-stringify によりエスケープ。Task 3/5 で「先頭#段落が見出し化しない」を検証。✅
- **§4.2 書込直列化**: Task 8 enqueue。**フラッシュ**（unmount/blur/close）= Task 9。**rename衝突回避** = Task 7。**id強化** = Task 6。**エラー表面化（土台）** = Task 8 の saveStatus/lastError（可視UIは P1）。**saveActive整合** = Task 8。**空draft掃除** = Task 8 stashActive。✅
- **見出し1-6** = Task 4（parse）+ Task 3（serialize, depth clamp 6）+ Task 9（StarterKit levels）。✅
- **underline無効化** = Task 9。✅
- **§7 テスト方針**: Task 5（往復/冪等）+ Task 7（rename衝突）+ Task 8（直列化/掃除）。✅

**スコープ外（P0では未実施・後続フェーズ）**: タイトル第一級化＆リネームchurn削減（P1）、保存ステータスの可視UI（P1）、テーブルの実編集ノード化（後続）、外部変更の mtime 競合検知（spec §4.2 末尾の「軽量」項 — P1 以降）、インライン HTML の完全往復（P0 は素テキスト保全まで）。これらは P0 のデータ消失を止めた上での改善であり、本プランの範囲外。

**Type consistency**: `tiptapToMarkdown`/`markdownToTiptap` の export 名は不変。`generateId` は文字列・`parseFilename` 正規表現を id 長変更に合わせて緩和済み。store の新フィールド（`saveStatus`/`lastSavedAt`/`lastError`）はインターフェースと初期値の両方に追加。`WsError::AlreadyExists` を追加。
