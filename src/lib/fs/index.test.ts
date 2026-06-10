import { describe, it, expect, vi, beforeEach } from 'vitest'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/api/core', () => ({ invoke }))

import { listMarkdownFiles } from './index'

beforeEach(() => invoke.mockReset())

describe('list title source', () => {
  it('derives title from the filename, not the Rust H1 peek', async () => {
    invoke.mockResolvedValueOnce([
      { name: 'My Note_abcdef.md', title: 'Some H1 In Body', mtime_ms: 5 },
    ])
    const entries = await listMarkdownFiles('/ws')
    expect(entries[0].title).toBe('My Note')
    expect(entries[0].name).toBe('My Note_abcdef.md')
  })

  it('falls back to the raw title for non-conforming filenames', async () => {
    invoke.mockResolvedValueOnce([{ name: 'random.md', title: 'H1 Title', mtime_ms: 1 }])
    const entries = await listMarkdownFiles('/ws')
    expect(entries[0].title).toBe('H1 Title')
  })
})
