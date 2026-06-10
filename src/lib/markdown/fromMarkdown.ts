import type { JSONContent } from '@tiptap/react'
import type { Root, RootContent, PhrasingContent } from 'mdast'
import { mdastToMarkdown, parseProcessor, BLANK_LINE_CHAR } from './processor'

export function markdownToTiptap(markdown: string): JSONContent {
  const tree = parseProcessor.parse(markdown) as Root
  const content = (tree.children ?? [])
    .map(convertBlock)
    .filter((n): n is JSONContent => n !== null)
  return { type: 'doc', content }
}

function convertBlock(node: RootContent): JSONContent | null {
  switch (node.type) {
    case 'paragraph': {
      // remark wraps standalone images in a paragraph; unwrap to image block
      if (node.children.length === 1 && node.children[0].type === 'image') {
        const img = node.children[0]
        return { type: 'image', attrs: { src: img.url, alt: img.alt ?? '', title: img.title ?? null } }
      }
      // 保存時に空行(空段落)は非改行スペース1文字へ符号化される。空段落へ復元する。
      if (
        node.children.length === 1 &&
        node.children[0].type === 'text' &&
        node.children[0].value === BLANK_LINE_CHAR
      ) {
        return { type: 'paragraph' }
      }
      return { type: 'paragraph', content: convertInlines(node.children) }
    }
    case 'heading':
      return {
        type: 'heading',
        attrs: { level: Math.min(6, Math.max(1, node.depth)) },
        content: convertInlines(node.children),
      }
    case 'list': {
      const isTaskList = node.children.every(
        (it) => 'checked' in it && it.checked !== null && it.checked !== undefined,
      )
      if (isTaskList) {
        return {
          type: 'taskList',
          content: node.children.map((it) => ({
            type: 'taskItem',
            attrs: { checked: Boolean(it.checked) },
            content: listItemContent(it.children as RootContent[]),
          })),
        }
      }
      return {
        type: node.ordered ? 'orderedList' : 'bulletList',
        attrs: node.ordered && node.start ? { start: node.start } : undefined,
        content: node.children.map((it) => ({
          type: 'listItem',
          content: listItemContent(it.children as RootContent[]),
        })),
      }
    }
    case 'blockquote':
      return {
        type: 'blockquote',
        content: node.children
          .map(convertBlock)
          .filter((n): n is JSONContent => n !== null),
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
      return { type: 'image', attrs: { src: node.url, alt: node.alt ?? '', title: node.title ?? null } }
    default:
      return toRawBlock(node)
  }
}

/**
 * listItem / taskItem は TipTap の schema 上 `paragraph block*`（先頭は必ず段落）。
 * 画像のみ・HTML(rawBlock)のみ・ネストリストのみ等で先頭が段落にならない場合に
 * 空段落を補い、"invalid content" を防ぐ（内容は失わない）。
 */
function listItemContent(children: RootContent[]): JSONContent[] {
  const blocks = children
    .map((c) => convertBlock(c))
    .filter((n): n is JSONContent => n !== null)
  if (blocks.length === 0 || blocks[0].type !== 'paragraph') {
    blocks.unshift({ type: 'paragraph' })
  }
  return blocks
}

function convertInlines(nodes: PhrasingContent[]): JSONContent[] {
  const out: JSONContent[] = []
  for (const n of nodes) {
    out.push(...convertInline(n, []))
  }
  return out
}

function convertInline(
  node: PhrasingContent,
  marks: { type: string; attrs?: Record<string, unknown> }[],
): JSONContent[] {
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
        convertInline(c, [...marks, { type: 'link', attrs: { href: node.url, title: node.title ?? null } }]),
      )
    case 'image':
      return [{ type: 'image', attrs: { src: node.url, alt: node.alt ?? '', title: node.title ?? null } }]
    case 'break':
      return [{ type: 'hardBreak' }]
    default: {
      const n = node as {
        value?: string
        alt?: string
        identifier?: string
        children?: PhrasingContent[]
      }
      // reference-style リンク等: 子のテキストを保全（リンク関連付けは失うが文字は残す）
      if (Array.isArray(n.children) && n.children.length > 0) {
        return n.children.flatMap((c) => convertInline(c, marks))
      }
      // 値を持つ未対応 leaf（inline html 等）はテキストとして保全
      if (typeof n.value === 'string') {
        return [{ type: 'text', text: n.value, marks: marks.length ? marks : undefined }]
      }
      // image reference の alt を保全
      if (typeof n.alt === 'string' && n.alt) {
        return [{ type: 'text', text: n.alt, marks: marks.length ? marks : undefined }]
      }
      // footnote reference 等は参照記法 [^id] を保持
      if (typeof n.identifier === 'string') {
        return [{ type: 'text', text: `[^${n.identifier}]`, marks: marks.length ? marks : undefined }]
      }
      return []
    }
  }
}

function toRawBlock(node: RootContent): JSONContent {
  const root: Root = { type: 'root', children: [node] }
  let markdown = ''
  try {
    markdown = mdastToMarkdown(root)
  } catch {
    markdown = ''
  }
  return { type: 'rawBlock', attrs: { mdast: JSON.stringify(node), markdown } }
}
