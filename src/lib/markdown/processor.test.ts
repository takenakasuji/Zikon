import { describe, it, expect } from 'vitest'
import type { Root } from 'mdast'
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
    expect(mdastToMarkdown(tree as unknown as Root)).toBe('# Hello')
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
    expect(mdastToMarkdown(tree as unknown as Root)).toBe('- **x**')
  })
})
