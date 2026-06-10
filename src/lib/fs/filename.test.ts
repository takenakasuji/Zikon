import { describe, it, expect } from 'vitest'
import { generateId, sanitizeTitle, buildFilename, parseFilename, extractFirstH1 } from './filename'

describe('generateId', () => {
  it('returns a 10-char hex string', () => {
    const id = generateId()
    expect(id).toMatch(/^[0-9a-f]{10}$/)
  })

  it('returns different ids on subsequent calls', () => {
    const a = generateId()
    const b = generateId()
    expect(a).not.toBe(b)
  })

  it('falls back to an fs-safe 10-char id when crypto.randomUUID is unavailable', () => {
    const original = globalThis.crypto
    // crypto を一時的に無効化してフォールバック経路を検証
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true })
    try {
      expect(generateId()).toMatch(/^[0-9a-z]{10}$/)
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true })
    }
  })
})

describe('sanitizeTitle', () => {
  it('replaces filesystem-forbidden chars with underscore', () => {
    expect(sanitizeTitle('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j')
  })

  it('replaces newlines and tabs with underscore', () => {
    expect(sanitizeTitle('foo\nbar\tbaz')).toBe('foo_bar_baz')
  })

  it('truncates titles longer than 40 chars', () => {
    const long = 'あ'.repeat(60)
    expect(sanitizeTitle(long).length).toBe(40)
  })

  it('returns empty string for empty input', () => {
    expect(sanitizeTitle('')).toBe('')
  })

  it('trims trailing whitespace', () => {
    expect(sanitizeTitle('  hello  ')).toBe('hello')
  })
})

describe('buildFilename', () => {
  it('combines title and id with underscore', () => {
    expect(buildFilename('設計メモ', 'abc123')).toBe('設計メモ_abc123.md')
  })

  it('uses "untitled" when title is empty', () => {
    expect(buildFilename('', 'abc123')).toBe('untitled_abc123.md')
  })

  it('sanitizes the title portion', () => {
    expect(buildFilename('a/b', 'abc123')).toBe('a_b_abc123.md')
  })
})

describe('parseFilename', () => {
  it('extracts id from end of filename', () => {
    expect(parseFilename('設計メモ_abc123.md')).toEqual({ title: '設計メモ', id: 'abc123' })
  })

  it('handles untitled', () => {
    expect(parseFilename('untitled_xyz789.md')).toEqual({ title: '', id: 'xyz789' })
  })

  it('returns null for non-conforming filenames', () => {
    expect(parseFilename('readme.md')).toBeNull()
    expect(parseFilename('not-markdown.txt')).toBeNull()
  })
})

describe('extractFirstH1', () => {
  it('returns the first H1 heading', () => {
    expect(extractFirstH1('# Hello\n\n## sub\n# Second')).toBe('Hello')
  })

  it('ignores headings deeper than H1', () => {
    expect(extractFirstH1('## sub\n# top')).toBe('top')
  })

  it('returns empty string when no H1 exists', () => {
    expect(extractFirstH1('plain text\n## sub')).toBe('')
  })

  it('trims whitespace', () => {
    expect(extractFirstH1('#   Spaced   ')).toBe('Spaced')
  })
})

describe('generateId', () => {
  it('produces unique ids across rapid calls', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateId()))
    expect(ids.size).toBe(1000)
  })

  it('produces filesystem-safe ids (alphanumeric/dash only)', () => {
    expect(generateId()).toMatch(/^[0-9a-z-]+$/)
  })
})

describe('sanitizeTitle', () => {
  it('does not split surrogate pairs when truncating', () => {
    const emoji = '😀'.repeat(50)
    const out = sanitizeTitle(emoji)
    expect(out).toBe(out.normalize('NFC'))
    expect([...out].every((ch) => ch === '😀')).toBe(true)
  })

  it('trims trailing dots and spaces', () => {
    expect(sanitizeTitle('hello.. ')).toBe('hello')
  })
})
