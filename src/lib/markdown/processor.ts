import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkStringify from 'remark-stringify'
import type { Root } from 'mdast'

/**
 * 空段落（ユーザーが入れた空行）は CommonMark では表現できず、再パース時に連続空行が
 * 1 つの区切りへ畳まれて失われる。保存時に各空行をこの非改行スペース(U+00A0) 1 文字の
 * 段落として符号化し（markdown ビューアでも空行として描画される）、読込時に空段落へ復元する。
 */
export const BLANK_LINE_CHAR = String.fromCharCode(0x00a0)

/** markdown 文字列 → mdast。読込で使用。 */
export const parseProcessor = unified().use(remarkParse).use(remarkGfm)

/** mdast → markdown 文字列。保存で使用。スタイルは既存の出力に合わせる。 */
// Intentionally stringify-only: no remarkParse needed since we only call .stringify() on an already-built mdast tree.
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

export function mdastToMarkdown(tree: Root): string {
  return stringifyProcessor.stringify(tree).trimEnd()
}
