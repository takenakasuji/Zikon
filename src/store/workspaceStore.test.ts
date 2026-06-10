import { describe, it, expect, vi, beforeEach } from 'vitest'

type MockFileEntry = { name: string; title: string; mtimeMs: number }

const fs = vi.hoisted(() => ({
  listMarkdownFiles: vi.fn(async (): Promise<MockFileEntry[]> => []),
  listStashFiles: vi.fn(async (): Promise<MockFileEntry[]> => []),
  listDraftFiles: vi.fn(async (): Promise<MockFileEntry[]> => []),
  listWorkFiles: vi.fn(async (): Promise<MockFileEntry[]> => []),
  readDocument: vi.fn(async () => ''),
  writeDocument: vi.fn(async (_ws: string, _name: string, _content: string) => {}),
  renameDocument: vi.fn(async () => {}),
  deleteDocument: vi.fn(async (_ws: string, _name: string) => {}),
  searchDocuments: vi.fn(async (): Promise<MockFileEntry[]> => []),
}))
vi.mock('@/lib/fs', () => fs)
vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn(async () => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() })),
}))
vi.mock('@/store/toastStore', () => ({
  useToastStore: { getState: () => ({ push: vi.fn(), dismiss: vi.fn(), toasts: [] }) },
}))

import { useWorkspaceStore } from './workspaceStore'

const wrote = (path: string, content?: string) =>
  fs.writeDocument.mock.calls.some(
    (c) => c[1] === path && (content === undefined || c[2] === content),
  )
const deleted = (path: string) => fs.deleteDocument.mock.calls.some((c) => c[1] === path)

beforeEach(() => {
  Object.values(fs).forEach((f) => f.mockClear())
  useWorkspaceStore.setState({
    workspace: '/ws',
    active: { name: 'untitled_aaaaaa.md', title: '', id: 'aaaaaa', content: '' },
    files: [],
    stashes: [],
    dirty: false,
  })
})

describe('updateActiveContent autosaves to .work/, never to Kura', () => {
  it('writes the working doc under .work/', async () => {
    await useWorkspaceStore.getState().updateActiveContent('# Hello')
    expect(wrote('.work/untitled_aaaaaa.md', '# Hello')).toBe(true)
    expect(wrote('untitled_aaaaaa.md')).toBe(false) // never to Kura root
    expect(useWorkspaceStore.getState().dirty).toBe(true)
  })

  it('does not persist an empty working doc', async () => {
    await useWorkspaceStore.getState().updateActiveContent('')
    expect(fs.writeDocument).not.toHaveBeenCalled()
    expect(useWorkspaceStore.getState().dirty).toBe(false)
  })

  it('skips a stale write whose forDocId no longer matches the active doc', async () => {
    await useWorkspaceStore.getState().updateActiveContent('# x', 'OTHERID')
    expect(fs.writeDocument).not.toHaveBeenCalled()
  })
})

describe('saveActive commits the working doc to Kura', () => {
  it('writes to the Kura root then resets Zen to a fresh empty doc', async () => {
    useWorkspaceStore.setState({
      active: { name: 'Note_aaaaaa.md', title: 'Note', id: 'aaaaaa', content: 'body' },
      dirty: true,
    })
    await useWorkspaceStore.getState().saveActive()
    expect(wrote('Note_aaaaaa.md', 'body')).toBe(true)
    expect(useWorkspaceStore.getState().dirty).toBe(false)
    // Zen is reset to a new empty document
    expect(useWorkspaceStore.getState().active?.name).not.toBe('Note_aaaaaa.md')
    expect(useWorkspaceStore.getState().active?.content).toBe('')
  })

  it('removes the same-id stash copy (graduates from Stash)', async () => {
    useWorkspaceStore.setState({
      active: { name: 'Note_aaaaaa.md', title: 'Note', id: 'aaaaaa', content: 'body' },
      stashes: [{ name: 'Note_aaaaaa.md', title: 'Note', mtimeMs: 1 }],
      dirty: true,
    })
    await useWorkspaceStore.getState().saveActive()
    expect(deleted('.stash/Note_aaaaaa.md')).toBe(true)
  })

  it('is a no-op for an empty doc', async () => {
    await useWorkspaceStore.getState().saveActive()
    expect(fs.writeDocument).not.toHaveBeenCalled()
  })
})

describe('stashActive sets the working doc aside', () => {
  it('writes to .stash/ and resets Zen to a fresh empty doc', async () => {
    useWorkspaceStore.setState({
      active: { name: 'Note_aaaaaa.md', title: 'Note', id: 'aaaaaa', content: 'body' },
      dirty: true,
    })
    await useWorkspaceStore.getState().stashActive()
    expect(wrote('.stash/Note_aaaaaa.md', 'body')).toBe(true)
    expect(useWorkspaceStore.getState().active?.content).toBe('')
    expect(useWorkspaceStore.getState().active?.name).not.toBe('Note_aaaaaa.md')
  })

  it('removes the same-id Kura copy (lifecycle #4: kura には存在しない)', async () => {
    useWorkspaceStore.setState({
      active: { name: 'Note_aaaaaa.md', title: 'Note', id: 'aaaaaa', content: 'body' },
      files: [{ name: 'Note_aaaaaa.md', title: 'Note', mtimeMs: 1 }],
      dirty: true,
    })
    await useWorkspaceStore.getState().stashActive()
    expect(deleted('Note_aaaaaa.md')).toBe(true)
  })
})

describe('openFile / openStash load a working copy and keep the source', () => {
  it('openFile copies the Kura doc into .work/ and does not remove the Kura source', async () => {
    fs.readDocument.mockResolvedValueOnce('saved body')
    await useWorkspaceStore.getState().openFile('Note_bbbbbb.md')
    expect(fs.readDocument).toHaveBeenCalledWith('/ws', 'Note_bbbbbb.md')
    expect(wrote('.work/Note_bbbbbb.md', 'saved body')).toBe(true)
    expect(deleted('Note_bbbbbb.md')).toBe(false) // Kura source stays
    expect(useWorkspaceStore.getState().active?.name).toBe('Note_bbbbbb.md')
    expect(useWorkspaceStore.getState().dirty).toBe(false)
  })

  it('openStash reads from .stash/ and keeps the stash source', async () => {
    fs.readDocument.mockResolvedValueOnce('stash body')
    await useWorkspaceStore.getState().openStash('Note_cccccc.md')
    expect(fs.readDocument).toHaveBeenCalledWith('/ws', '.stash/Note_cccccc.md')
    expect(wrote('.work/Note_cccccc.md', 'stash body')).toBe(true)
    expect(deleted('.stash/Note_cccccc.md')).toBe(false) // stash source stays
    expect(useWorkspaceStore.getState().active?.name).toBe('Note_cccccc.md')
  })
})

describe('displacement auto-stashes unsaved work to avoid loss', () => {
  it('auto-stashes the current dirty working doc before opening another', async () => {
    useWorkspaceStore.setState({
      active: { name: 'WIP_aaaaaa.md', title: 'WIP', id: 'aaaaaa', content: 'unsaved' },
      dirty: true,
    })
    fs.readDocument.mockResolvedValueOnce('other body')
    await useWorkspaceStore.getState().openFile('Other_bbbbbb.md')
    expect(wrote('.stash/WIP_aaaaaa.md', 'unsaved')).toBe(true)
    expect(useWorkspaceStore.getState().active?.name).toBe('Other_bbbbbb.md')
  })

  it('does NOT auto-stash a clean (not dirty) working doc on createNew', async () => {
    useWorkspaceStore.setState({
      active: { name: 'Clean_aaaaaa.md', title: 'Clean', id: 'aaaaaa', content: 'saved' },
      dirty: false,
    })
    await useWorkspaceStore.getState().createNew()
    expect(wrote('.stash/Clean_aaaaaa.md')).toBe(false)
    expect(useWorkspaceStore.getState().active?.content).toBe('')
  })
})

describe('deleteFile removes a saved Kura document', () => {
  it('deletes from Kura and resets the editor if it was the open doc', async () => {
    useWorkspaceStore.setState({
      active: { name: 'Gone_aaaaaa.md', title: 'Gone', id: 'aaaaaa', content: 'x' },
      files: [{ name: 'Gone_aaaaaa.md', title: 'Gone', mtimeMs: 1 }],
    })
    await useWorkspaceStore.getState().deleteFile('Gone_aaaaaa.md')
    expect(deleted('Gone_aaaaaa.md')).toBe(true)
    expect(useWorkspaceStore.getState().active?.name).not.toBe('Gone_aaaaaa.md')
  })
})

describe('setWorkspace', () => {
  it('migrates legacy .drafts/* into the root', async () => {
    fs.listDraftFiles.mockResolvedValueOnce([{ name: 'Old_bbbbbb.md', title: 'Old', mtimeMs: 1 }])
    await useWorkspaceStore.getState().setWorkspace('/ws')
    expect(fs.renameDocument).toHaveBeenCalledWith('/ws', '.drafts/Old_bbbbbb.md', 'Old_bbbbbb.md')
  })

  it('resumes the working doc from .work/ on startup', async () => {
    fs.listWorkFiles.mockResolvedValueOnce([{ name: 'Resumed_bbbbbb.md', title: 'Resumed', mtimeMs: 1 }])
    fs.readDocument.mockResolvedValueOnce('resumed body')
    await useWorkspaceStore.getState().setWorkspace('/ws')
    expect(fs.readDocument).toHaveBeenCalledWith('/ws', '.work/Resumed_bbbbbb.md')
    expect(useWorkspaceStore.getState().active?.name).toBe('Resumed_bbbbbb.md')
    expect(useWorkspaceStore.getState().active?.content).toBe('resumed body')
  })
})

describe('open robustness / data-safety', () => {
  it('re-opening the document already being edited is a no-op (no read, no destructive op)', async () => {
    useWorkspaceStore.setState({
      active: { name: 'Cur_aaaaaa.md', title: 'Cur', id: 'aaaaaa', content: 'x' },
      dirty: true,
    })
    await useWorkspaceStore.getState().openFile('Cur_aaaaaa.md')
    expect(fs.readDocument).not.toHaveBeenCalled()
    expect(fs.writeDocument).not.toHaveBeenCalled()
    expect(useWorkspaceStore.getState().active?.name).toBe('Cur_aaaaaa.md')
  })

  it('aborts the switch and keeps the working buffer when the auto-stash write fails (no data loss)', async () => {
    useWorkspaceStore.setState({
      active: { name: 'WIP_aaaaaa.md', title: 'WIP', id: 'aaaaaa', content: 'unsaved' },
      dirty: true,
    })
    fs.readDocument.mockResolvedValueOnce('other body')
    fs.writeDocument.mockRejectedValueOnce(new Error('disk full')) // the stash write fails
    await expect(useWorkspaceStore.getState().openFile('Other_bbbbbb.md')).rejects.toThrow()
    expect(deleted('.work/WIP_aaaaaa.md')).toBe(false) // working buffer preserved
    expect(useWorkspaceStore.getState().active?.name).toBe('WIP_aaaaaa.md') // switch aborted
  })
})
