import { describe, it, expect } from 'vitest'
import type { JSONContent } from '@tiptap/react'
import { markdownToTiptap } from './fromMarkdown'
import { tiptapToMarkdown } from './toMarkdown'

const para = (text?: string): JSONContent =>
  text === undefined ? { type: 'paragraph' } : { type: 'paragraph', content: [{ type: 'text', text }] }

const summarize = (doc: JSONContent) =>
  (doc.content ?? []).map((n) => ({ t: n.type ?? '', txt: n.content?.[0]?.text ?? null }))

describe('blank lines (empty paragraphs) survive the markdown round-trip', () => {
  it('preserves interior blank lines between text', () => {
    const doc = {
      type: 'doc',
      content: [para('A'), para(), para(), para('B'), para(), para('C')],
    }
    const back = markdownToTiptap(tiptapToMarkdown(doc))
    expect(summarize(back)).toEqual([
      { t: 'paragraph', txt: 'A' },
      { t: 'paragraph', txt: null },
      { t: 'paragraph', txt: null },
      { t: 'paragraph', txt: 'B' },
      { t: 'paragraph', txt: null },
      { t: 'paragraph', txt: 'C' },
    ])
  })

  it('keeps an empty doc as a byte-empty markdown string (no nbsp noise)', () => {
    expect(tiptapToMarkdown({ type: 'doc', content: [para()] })).toBe('')
    expect(tiptapToMarkdown({ type: 'doc', content: [para(), para(), para()] })).toBe('')
  })

  it('trims leading/trailing blank lines but keeps the content', () => {
    const doc = { type: 'doc', content: [para(), para('X'), para(), para()] }
    const back = markdownToTiptap(tiptapToMarkdown(doc))
    expect(summarize(back)).toEqual([{ t: 'paragraph', txt: 'X' }])
  })

  it('is idempotent for content with interior blank lines', () => {
    const doc = { type: 'doc', content: [para('A'), para(), para('B')] }
    const once = tiptapToMarkdown(doc)
    const twice = tiptapToMarkdown(markdownToTiptap(once))
    expect(twice).toBe(once)
  })
})
