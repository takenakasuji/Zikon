import type { JSONContent } from '@tiptap/react'
import type {
  Root,
  RootContent,
  BlockContent,
  DefinitionContent,
  PhrasingContent,
  ListItem,
  Blockquote,
  Heading,
} from 'mdast'
import { mdastToMarkdown, BLANK_LINE_CHAR } from './processor'

/**
 * Block-level children produced from TipTap block nodes. In practice every
 * block handler returns block content (never inline-only nodes like Break),
 * but `blockToMdast` is typed as `RootContent`; narrow it here for the mdast
 * containers (ListItem / Blockquote) that require `BlockContent | DefinitionContent`.
 */
type FlowContent = BlockContent | DefinitionContent

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

function listItems(
  content: JSONContent[] | undefined,
  checkedOf: (n: JSONContent) => boolean | null,
): ListItem[] {
  return (content ?? []).map((item) => ({
    type: 'listItem',
    spread: false,
    checked: checkedOf(item),
    children: blocks(item.content) as FlowContent[],
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
      return { type: 'blockquote', children: blocks(node.content) as Blockquote['children'] }
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
      const fallback = (node.attrs?.markdown as string) ?? ''
      if (raw) {
        try {
          return JSON.parse(raw) as RootContent
        } catch {
          // fall through to the preserved-source fallback below
        }
      }
      // mdast が無い/壊れていても、保持している元 markdown を verbatim で書き戻して消失を防ぐ
      return fallback ? { type: 'html', value: fallback } : null
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

function isEmptyParagraph(n: RootContent): boolean {
  return n.type === 'paragraph' && n.children.length === 0
}

/**
 * 先頭・末尾の空段落は捨て（空ドキュメントはバイト的に空のファイルのまま）、本文に挟まれた
 * 空行（空段落）だけを非改行スペース1文字の段落として符号化する。これにより markdown を
 * 経由しても本文中の改行が保持される（[[processor.ts]] の BLANK_LINE_CHAR 参照）。
 */
function encodeBlankLines(nodes: RootContent[]): RootContent[] {
  let first = 0
  let last = nodes.length - 1
  while (first <= last && isEmptyParagraph(nodes[first])) first++
  while (last >= first && isEmptyParagraph(nodes[last])) last--
  const out: RootContent[] = []
  for (let i = first; i <= last; i++) {
    const n = nodes[i]
    out.push(
      isEmptyParagraph(n)
        ? { type: 'paragraph', children: [{ type: 'text', value: BLANK_LINE_CHAR }] }
        : n,
    )
  }
  return out
}

export function tiptapToMarkdown(json: JSONContent): string {
  const children = json.type === 'doc' ? blocks(json.content) : blocks([json])
  const root: Root = { type: 'root', children: encodeBlankLines(children) }
  return mdastToMarkdown(root)
}
