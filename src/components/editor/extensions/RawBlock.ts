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
