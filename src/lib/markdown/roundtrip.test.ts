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

  it('does NOT promote a body paragraph starting with "#" into a heading (escaping)', () => {
    const tiptapDoc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'first line' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '# not a heading' }] },
      ],
    }
    const md = tiptapToMarkdown(tiptapDoc)
    const reparsed = markdownToTiptap(md)
    const second = reparsed.content?.[1]
    expect(second?.type).toBe('paragraph')
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
