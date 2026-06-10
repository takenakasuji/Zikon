import { describe, it, expect } from 'vitest'
import { RawBlock } from './RawBlock'

describe('RawBlock', () => {
  it('is a block-level atom node named rawBlock', () => {
    expect(RawBlock.name).toBe('rawBlock')
    const config = RawBlock.config as { group?: string; atom?: boolean }
    expect(config.group).toBe('block')
    expect(config.atom).toBe(true)
  })

  it('declares mdast and markdown attributes', () => {
    const attrs = RawBlock.config.addAttributes?.call({} as never) as Record<string, unknown>
    expect(attrs).toHaveProperty('mdast')
    expect(attrs).toHaveProperty('markdown')
  })
})
