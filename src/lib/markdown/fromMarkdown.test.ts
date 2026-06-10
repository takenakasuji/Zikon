import { describe, it, expect } from 'vitest'
import { markdownToTiptap } from './fromMarkdown'
import { tiptapToMarkdown } from './toMarkdown'

describe('markdownToTiptap', () => {
  it('parses paragraph', () => {
    const result = markdownToTiptap('hello world')
    expect(result.type).toBe('doc')
    expect(result.content?.[0]).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: 'hello world' }],
    })
  })

  it('parses headings 1-3', () => {
    const result = markdownToTiptap('# H1\n\n## H2\n\n### H3')
    expect(result.content).toHaveLength(3)
    expect(result.content?.[0]).toMatchObject({ type: 'heading', attrs: { level: 1 } })
    expect(result.content?.[1]).toMatchObject({ type: 'heading', attrs: { level: 2 } })
    expect(result.content?.[2]).toMatchObject({ type: 'heading', attrs: { level: 3 } })
  })

  it('parses bullet list', () => {
    const result = markdownToTiptap('- a\n- b')
    expect(result.content?.[0]?.type).toBe('bulletList')
    expect(result.content?.[0]?.content).toHaveLength(2)
  })

  it('parses ordered list', () => {
    const result = markdownToTiptap('1. a\n2. b')
    expect(result.content?.[0]?.type).toBe('orderedList')
  })

  it('parses task list', () => {
    const result = markdownToTiptap('- [ ] todo\n- [x] done')
    expect(result.content?.[0]?.type).toBe('taskList')
    const items = result.content?.[0]?.content ?? []
    expect(items[0]?.attrs?.checked).toBe(false)
    expect(items[1]?.attrs?.checked).toBe(true)
  })

  it('parses blockquote', () => {
    const result = markdownToTiptap('> quoted')
    expect(result.content?.[0]?.type).toBe('blockquote')
  })

  it('parses fenced code block with language', () => {
    const result = markdownToTiptap('```ts\nconst x = 1\n```')
    expect(result.content?.[0]).toMatchObject({
      type: 'codeBlock',
      attrs: { language: 'ts' },
    })
  })

  it('parses horizontal rule', () => {
    const result = markdownToTiptap('---')
    expect(result.content?.[0]?.type).toBe('horizontalRule')
  })

  it('parses bold and italic and strike and code marks', () => {
    const result = markdownToTiptap('**b** *i* ~~s~~ `c`')
    const para = result.content?.[0]
    expect(para?.type).toBe('paragraph')
    const marks = (para?.content ?? []).map((n: any) =>
      (n.marks ?? []).map((m: any) => m.type).sort().join(','),
    )
    expect(marks).toContain('bold')
    expect(marks).toContain('italic')
    expect(marks).toContain('strike')
    expect(marks).toContain('code')
  })

  it('parses link', () => {
    const result = markdownToTiptap('[Zen](https://example.com)')
    const link: any = result.content?.[0]?.content?.[0]
    expect(link?.marks?.[0]?.type).toBe('link')
    expect(link?.marks?.[0]?.attrs?.href).toBe('https://example.com')
  })

  it('parses image', () => {
    const result = markdownToTiptap('![alt](https://example.com/x.png)')
    expect(result.content?.[0]).toMatchObject({
      type: 'image',
      attrs: { src: 'https://example.com/x.png', alt: 'alt' },
    })
  })

  it('returns empty doc for empty input', () => {
    const result = markdownToTiptap('')
    expect(result.type).toBe('doc')
    expect(result.content).toEqual([])
  })
})

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
    expect(node?.attrs?.markdown).toContain('| A | B |')
  })

  it('preserves a block HTML node as a rawBlock', () => {
    const doc = markdownToTiptap('<div class="x">hi</div>')
    const node = doc.content?.[0]
    expect(node?.type).toBe('rawBlock')
  })

  it('keeps link title', () => {
    const doc = markdownToTiptap('[x](https://e.com "ttl")')
    const textNode = doc.content?.[0]?.content?.[0]
    const linkMark = textNode?.marks?.find(
      (m: { type: string; attrs?: Record<string, unknown> }) => m.type === 'link',
    )
    expect(linkMark?.attrs?.title).toBe('ttl')
  })

  it('preserves the text of reference-style links (no inline data loss)', () => {
    const doc = markdownToTiptap('see [anchor][ref] here\n\n[ref]: https://e.com')
    const para = doc.content?.[0]
    const text = (para?.content ?? []).map((n) => n.text ?? '').join('')
    expect(text).toContain('see')
    expect(text).toContain('anchor')
    expect(text).toContain('here')
  })

  it('preserves footnote reference markers', () => {
    const doc = markdownToTiptap('Here[^1] more.\n\n[^1]: a note')
    const para = doc.content?.[0]
    const text = (para?.content ?? []).map((n) => n.text ?? '').join('')
    expect(text).toContain('Here')
    expect(text).toContain('more')
    expect(text).toContain('[^1]')
  })

  it('preserves image reference alt text', () => {
    const doc = markdownToTiptap('![my alt][img]\n\n[img]: https://e.com/x.png')
    const para = doc.content?.[0]
    const text = (para?.content ?? []).map((n) => n.text ?? '').join('')
    expect(text).toContain('my alt')
  })
})

describe('roundtrip md → tiptap → md', () => {
  const cases = [
    '# Hello',
    '# Hello\n\nworld',
    '- a\n- b\n- c\n',
    '1. a\n2. b\n',
    '- [ ] todo\n- [x] done\n',
    '> quoted line\n',
    '```ts\nconst x = 1\n```\n',
    '---\n',
    '**bold** and *italic* and ~~strike~~ and `code`\n',
    '[link](https://example.com)\n',
  ]
  for (const md of cases) {
    it(`roundtrips: ${JSON.stringify(md.slice(0, 30))}`, () => {
      const json = markdownToTiptap(md)
      const back = tiptapToMarkdown(json)
      expect(back.trim()).toBe(md.trim())
    })
  }
})
