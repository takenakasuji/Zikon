import { describe, it, expect } from 'vitest'
import { looksLikeMarkdown } from './detect'

describe('looksLikeMarkdown', () => {
  it('detects block markers', () => {
    expect(looksLikeMarkdown('# Heading')).toBe(true)
    expect(looksLikeMarkdown('- item\n- item2')).toBe(true)
    expect(looksLikeMarkdown('1. one')).toBe(true)
    expect(looksLikeMarkdown('> quote')).toBe(true)
    expect(looksLikeMarkdown('```ts\ncode\n```')).toBe(true)
    expect(looksLikeMarkdown('| A | B |\n| - | - |')).toBe(true)
  })
  it('detects inline markers', () => {
    expect(looksLikeMarkdown('see [text](https://e.com)')).toBe(true)
    expect(looksLikeMarkdown('this is **bold**')).toBe(true)
    expect(looksLikeMarkdown('use `code` here')).toBe(true)
    expect(looksLikeMarkdown('~~strike~~')).toBe(true)
  })
  it('returns false for plain text and bare URLs', () => {
    expect(looksLikeMarkdown('just a sentence')).toBe(false)
    expect(looksLikeMarkdown('https://example.com')).toBe(false)
    expect(looksLikeMarkdown('a single word')).toBe(false)
  })
})
