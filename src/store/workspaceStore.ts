'use client'
import { create } from 'zustand'
import { load, Store } from '@tauri-apps/plugin-store'
import type { Document, FileEntry } from '@/types'
import {
  listDraftFiles,
  listMarkdownFiles,
  listStashFiles,
  listWorkFiles,
  readDocument,
  writeDocument,
  renameDocument,
  deleteDocument,
  searchDocuments,
} from '@/lib/fs'
import { buildFilename, generateId, parseFilename } from '@/lib/fs/filename'
import { useToastStore } from './toastStore'

const STASH_DIR = '.stash'
// 旧バージョンの下書きフォルダ。新規には使わず、初回読込時にルートへ移行するためだけに参照する。
const DRAFTS_DIR = '.drafts'
// 編集中の「作業ドキュメント」の置き場所（Kura には出さない・自動保存はここにのみ書く）。
const WORK_DIR = '.work'

const workPath = (name: string) => `${WORK_DIR}/${name}`
const stashPath = (name: string) => `${STASH_DIR}/${name}`
const idOf = (name: string) => parseFilename(name)?.id ?? null

// 全永続化を直列化する単一キュー（fire-and-forget の競合を防ぐ）。
let writeQueue: Promise<unknown> = Promise.resolve()
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task, task)
  writeQueue = run.catch(() => {})
  return run
}

function notifyError(message: string) {
  try {
    useToastStore.getState().push({ kind: 'error', message })
  } catch {
    // テスト等でトースト未初期化でも落とさない
  }
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface WorkspaceState {
  workspace: string | null
  /** saved documents in workspace root (shown in Kura) */
  files: FileEntry[]
  /** temporarily set-aside documents in .stash/ (shown in Stash menu) */
  stashes: FileEntry[]
  /** the document currently open in Zen (backed by .work/, NOT in Kura) */
  active: Document | null
  /** active has edits not yet committed to Kura via save */
  dirty: boolean
  loading: boolean
  saveStatus: SaveStatus
  lastSavedAt: number | null
  lastError: string | null

  setWorkspace: (path: string) => Promise<void>
  reloadFiles: () => Promise<void>
  reloadStashes: () => Promise<void>
  /** open a saved document from Kura as the working doc (source stays in Kura) */
  openFile: (name: string) => Promise<void>
  /** open a stashed document as the working doc (source stays in Stash) */
  openStash: (name: string) => Promise<void>
  /** start a fresh empty working document */
  createNew: () => Promise<void>
  /** autosave the working doc to .work/ (NEVER to Kura). forDocId guards stale writes. */
  updateActiveContent: (content: string, forDocId?: string) => Promise<void>
  setActiveTitle: (title: string) => Promise<void>
  /** delete a saved Kura document */
  deleteFile: (name: string) => Promise<void>
  /** commit the working doc to Kura, then reset Zen to a fresh doc; no-op for an empty doc */
  saveActive: () => Promise<void>
  /** move the working doc to .stash/, then reset Zen to a fresh empty doc */
  stashActive: () => Promise<void>
  /** full-text search over Kura (workspace root) */
  search: (query: string) => Promise<FileEntry[]>
  clearWorkspace: () => Promise<void>
}

let configStore: Store | null = null
async function getConfigStore(): Promise<Store> {
  if (!configStore) configStore = await load('zikon-config.json', { autoSave: true, defaults: {} })
  return configStore
}

const WORKSPACE_KEY = 'workspace_path'

export async function loadSavedWorkspace(): Promise<string | null> {
  const s = await getConfigStore()
  const v = await s.get<string>(WORKSPACE_KEY)
  return v ?? null
}

async function saveWorkspace(path: string): Promise<void> {
  const s = await getConfigStore()
  await s.set(WORKSPACE_KEY, path)
}

async function clearSavedWorkspace(): Promise<void> {
  const s = await getConfigStore()
  await s.delete(WORKSPACE_KEY)
}

function emptyDoc(): Document {
  const id = generateId()
  return { name: buildFilename('', id), title: '', id, content: '' }
}

function isEmptyDoc(doc: Document): boolean {
  return doc.title.trim() === '' && doc.content.trim() === ''
}

/**
 * 一度きりの移行: 旧 .drafts/ にあるファイルをワークスペースのルートへ移す。
 * 失敗しても元ファイルは .drafts/ に残すので（データを失わない）、次回読込で再試行される。
 */
async function migrateLegacyDrafts(path: string): Promise<void> {
  let drafts: FileEntry[]
  try {
    drafts = await listDraftFiles(path)
  } catch {
    return
  }
  for (const d of drafts) {
    try {
      await renameDocument(path, `${DRAFTS_DIR}/${d.name}`, d.name)
    } catch {
      // 同名衝突などで失敗した場合は元の場所に残す
    }
  }
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => {
  // 同一 id の他所コピーを id ベースで掃除する（タイトル改名にも強い）。exceptName は残す対象。
  const removeKuraCopiesById = async (ws: string, id: string, exceptName?: string) => {
    for (const f of get().files) {
      if (f.name !== exceptName && idOf(f.name) === id) {
        try {
          await deleteDocument(ws, f.name)
        } catch {
          /* noop */
        }
      }
    }
  }
  const removeStashCopiesById = async (ws: string, id: string, exceptName?: string) => {
    for (const s of get().stashes) {
      if (s.name !== exceptName && idOf(s.name) === id) {
        try {
          await deleteDocument(ws, stashPath(s.name))
        } catch {
          /* noop */
        }
      }
    }
  }

  // 別ドキュメントへ切り替える前に、今の working を安全に退避/破棄する。
  // 未保存の編集があれば自動 stash（move 意味論で Kura からは外す）。戻り値は stash したか。
  const displaceCurrent = async (): Promise<boolean> => {
    const ws = get().workspace
    const active = get().active
    if (!ws || !active) return false
    const needsStash = get().dirty && !isEmptyDoc(active)
    let didStash = false
    if (needsStash) {
      try {
        await writeDocument(ws, stashPath(active.name), active.content)
        await removeKuraCopiesById(ws, active.id) // Kura から move
        await removeStashCopiesById(ws, active.id, active.name) // 改名前の stash 残骸
        didStash = true
      } catch (e) {
        // 退避失敗: working バッファは唯一の控えなので絶対に消さない。切替を中止する。
        set({ saveStatus: 'error', lastError: String(e) })
        notifyError('Failed to set the current document aside')
        throw e
      }
    }
    // working バッファを消すのは「退避済み」または「もともとクリーン/空」のときだけ。
    if (!needsStash || didStash) {
      try {
        await deleteDocument(ws, workPath(active.name))
      } catch {
        /* noop */
      }
    }
    return didStash
  }

  // 事前に読んだ content を working として確定する（読み込みは呼び出し側で displace より先に行う）。
  const setWorking = async (
    ws: string,
    name: string,
    parsed: { title: string; id: string },
    content: string,
  ) => {
    const doc: Document = { name, title: parsed.title, id: parsed.id, content }
    if (!isEmptyDoc(doc)) {
      await writeDocument(ws, workPath(name), content) // working バッファに複製
    }
    set({ active: doc, dirty: false, saveStatus: 'idle', lastSavedAt: null, lastError: null })
  }

  return {
    workspace: null,
    files: [],
    stashes: [],
    active: null,
    dirty: false,
    loading: false,
    saveStatus: 'idle',
    lastSavedAt: null,
    lastError: null,

    setWorkspace: async (path: string) => {
      set({ workspace: path, loading: true })
      await saveWorkspace(path)
      await migrateLegacyDrafts(path)
      await get().reloadFiles()
      await get().reloadStashes()

      // 作業中ドキュメントを .work/ から復帰。無ければ新規の空ドキュメント。Kura は自動で開かない。
      try {
        const work = await listWorkFiles(path)
        if (work.length > 0) {
          const name = work[0].name
          const content = await readDocument(path, workPath(name))
          const parsed = parseFilename(name)
          if (parsed) {
            // .work が Kura の同 id コピーと一致するなら clean とみなす（再起動後の自動退避で
            // 保存済みドキュメントが Kura から外れてしまうのを防ぐ）。
            let dirty = true
            const kuraSrc = get().files.find((f) => idOf(f.name) === parsed.id)
            if (kuraSrc) {
              try {
                const saved = await readDocument(path, kuraSrc.name)
                dirty = saved !== content || kuraSrc.name !== name
              } catch {
                dirty = true
              }
            }
            set({ active: { name, title: parsed.title, id: parsed.id, content }, dirty })
          } else {
            set({ active: emptyDoc(), dirty: false })
          }
        } else {
          set({ active: emptyDoc(), dirty: false })
        }
      } catch {
        set({ active: emptyDoc(), dirty: false })
      }

      set({ loading: false, saveStatus: 'idle', lastSavedAt: null, lastError: null })
    },

    reloadFiles: async () => {
      const ws = get().workspace
      if (!ws) return
      set({ files: await listMarkdownFiles(ws) })
    },

    reloadStashes: async () => {
      const ws = get().workspace
      if (!ws) return
      set({ stashes: await listStashFiles(ws) })
    },

    openFile: async (name: string) => {
      return enqueue(async () => {
        const ws = get().workspace
        if (!ws) return
        const parsed = parseFilename(name)
        if (!parsed) return
        if (get().active?.id === parsed.id) return // 既に作業中のドキュメント → no-op
        const content = await readDocument(ws, name) // 退避より先に読む（消える前に確保）
        await displaceCurrent() // 退避失敗時は throw → 切替中止（active 据え置き）
        await setWorking(ws, name, parsed, content)
        await get().reloadFiles()
        await get().reloadStashes()
      })
    },

    openStash: async (name: string) => {
      return enqueue(async () => {
        const ws = get().workspace
        if (!ws) return
        const parsed = parseFilename(name)
        if (!parsed) return
        if (get().active?.id === parsed.id) return
        const content = await readDocument(ws, stashPath(name)) // 退避より先に読む
        await displaceCurrent()
        await setWorking(ws, name, parsed, content) // stash の元は残す（save/stash で初めて移動）
        await get().reloadFiles()
        await get().reloadStashes()
      })
    },

    createNew: async () => {
      return enqueue(async () => {
        const ws = get().workspace
        if (!ws) return
        const didStash = await displaceCurrent()
        set({ active: emptyDoc(), dirty: false, saveStatus: 'idle', lastSavedAt: null, lastError: null })
        if (didStash) {
          await get().reloadFiles()
          await get().reloadStashes()
        }
      })
    },

    updateActiveContent: async (content: string, forDocId?: string) => {
      return enqueue(async () => {
        const active = get().active
        const ws = get().workspace
        if (!active || !ws) return
        // 別ドキュメントへ切り替わった後に遅延発火した書き込みは破棄する。
        if (forDocId !== undefined && active.id !== forDocId) return
        // 空（無題かつ本文なし）の working はディスクに残さない。
        if (isEmptyDoc({ ...active, content })) {
          try {
            await deleteDocument(ws, workPath(active.name))
          } catch {
            /* まだ無いなら正常 */
          }
          set({ active: { ...active, content }, dirty: false, saveStatus: 'idle', lastSavedAt: null, lastError: null })
          return
        }
        set({ saveStatus: 'saving' })
        try {
          // 自動保存は .work/ にのみ。Kura には絶対に書かない（save コマンド専用）。
          await writeDocument(ws, workPath(active.name), content)
          set({
            active: { ...active, content },
            dirty: true,
            saveStatus: 'saved',
            lastSavedAt: Date.now(),
            lastError: null,
          })
        } catch (e) {
          set({ saveStatus: 'error', lastError: String(e) })
          notifyError('Failed to save')
          throw e
        }
      })
    },

    setActiveTitle: async (title: string) => {
      return enqueue(async () => {
        const active = get().active
        const ws = get().workspace
        if (!active || !ws) return
        const newName = buildFilename(title, active.id)
        if (newName === active.name) {
          set({ active: { ...active, title } })
          return
        }
        set({ saveStatus: 'saving' })
        try {
          // タイトルだけの（本文なし）ドキュメントも .work/ に書く（再起動でタイトルが消えないように）。
          // working バッファを改名する（Kura/Stash の元は save/stash まで触らない）。
          if (!isEmptyDoc({ ...active, title })) {
            await writeDocument(ws, workPath(newName), active.content)
            try {
              await deleteDocument(ws, workPath(active.name))
            } catch {
              /* 旧バッファが無いのは正常 */
            }
          }
          set({
            active: { ...active, title, name: newName },
            dirty: true,
            saveStatus: 'saved',
            lastSavedAt: Date.now(),
            lastError: null,
          })
        } catch (e) {
          set({ saveStatus: 'error', lastError: String(e) })
          notifyError('Failed to save title')
          throw e
        }
      })
    },

    deleteFile: async (name: string) => {
      return enqueue(async () => {
        const ws = get().workspace
        if (!ws) return
        await deleteDocument(ws, name) // Kura から削除
        const active = get().active
        if (active?.name === name) {
          try {
            await deleteDocument(ws, workPath(name))
          } catch {
            /* noop */
          }
          set({ active: emptyDoc(), dirty: false })
        }
        await get().reloadFiles()
      })
    },

    saveActive: async () => {
      return enqueue(async () => {
        const ws = get().workspace
        const active = get().active
        if (!ws || !active) return
        if (isEmptyDoc(active)) return // 空はコミットしない
        set({ saveStatus: 'saving' })
        try {
          await writeDocument(ws, active.name, active.content) // → Kura(root)
          await removeKuraCopiesById(ws, active.id, active.name) // 改名前の Kura 残骸
          await removeStashCopiesById(ws, active.id) // stash から昇格（同 id を除去）
          // save 後は Zen を新規ドキュメントにリセットする（working バッファは破棄）
          try {
            await deleteDocument(ws, workPath(active.name))
          } catch {
            /* noop */
          }
          set({ active: emptyDoc(), dirty: false, saveStatus: 'idle', lastSavedAt: null, lastError: null })
          await get().reloadFiles()
          await get().reloadStashes()
        } catch (e) {
          set({ saveStatus: 'error', lastError: String(e) })
          notifyError('Failed to save to Kura')
          throw e
        }
      })
    },

    stashActive: async () => {
      return enqueue(async () => {
        const ws = get().workspace
        const active = get().active
        if (!ws || !active) return
        try {
          if (!isEmptyDoc(active)) {
            await writeDocument(ws, stashPath(active.name), active.content) // → .stash/
            await removeKuraCopiesById(ws, active.id) // Kura から move（→ "kura には存在しない"）
            await removeStashCopiesById(ws, active.id, active.name) // 改名前の stash 残骸
          }
          try {
            await deleteDocument(ws, workPath(active.name)) // working バッファを破棄
          } catch {
            /* noop */
          }
          set({ active: emptyDoc(), dirty: false, saveStatus: 'idle', lastSavedAt: null, lastError: null })
          await get().reloadFiles()
          await get().reloadStashes()
        } catch (e) {
          set({ saveStatus: 'error', lastError: String(e) })
          notifyError('Failed to stash')
          throw e
        }
      })
    },

    search: async (query: string) => {
      const ws = get().workspace
      if (!ws || query.trim() === '') return []
      return searchDocuments(ws, query)
    },

    clearWorkspace: async () => {
      await clearSavedWorkspace()
      set({ workspace: null, files: [], stashes: [], active: null, dirty: false })
    },
  }
})
