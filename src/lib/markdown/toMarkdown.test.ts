import { describe, it, expect } from 'vitest'
import type { JSONContent } from '@tiptap/react'
import { tiptapToMarkdown } from './toMarkdown'

const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content })
const p = (...c: JSONContent[]): JSONContent => ({ type: 'paragraph', content: c })
const t = (text: string, marks?: JSONContent['marks']): JSONContent => ({ type: 'text', text, ...(marks ? { marks } : {}) })

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

  it('falls back to preserved markdown when rawBlock mdast is malformed (no data loss)', () => {
    const out = tiptapToMarkdown(
      doc({ type: 'rawBlock', attrs: { mdast: '{not json', markdown: '| A | B |\n| --- | --- |\n| 1 | 2 |' } }),
    )
    expect(out).toContain('| A | B |')
    expect(out).toContain('| 1 | 2 |')
  })
})
