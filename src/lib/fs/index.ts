import { invoke } from '@tauri-apps/api/core'
import type { FileEntry } from '@/types'
import { parseFilename } from './filename'

interface RawFileEntry {
  name: string
  title: string
  mtime_ms: number
}

function toEntry(raw: RawFileEntry): FileEntry {
  // タイトルはファイル名（<title>_<id>.md）から導出する。P1 でタイトルは本文の H1 から
  // 分離されたため、Rust 側の H1 peek ではなくファイル名を正とする（DocTitle と一致させる）。
  const parsed = parseFilename(raw.name)
  return { name: raw.name, title: parsed?.title ?? raw.title, mtimeMs: raw.mtime_ms }
}

export async function listMarkdownFiles(workspace: string): Promise<FileEntry[]> {
  const raw = await invoke<RawFileEntry[]>('ws_list', { workspace })
  return raw.map(toEntry)
}

export async function listStashFiles(workspace: string): Promise<FileEntry[]> {
  const raw = await invoke<RawFileEntry[]>('ws_list_stash', { workspace })
  return raw.map(toEntry)
}

export async function listDraftFiles(workspace: string): Promise<FileEntry[]> {
  const raw = await invoke<RawFileEntry[]>('ws_list_drafts', { workspace })
  return raw.map(toEntry)
}

export async function listWorkFiles(workspace: string): Promise<FileEntry[]> {
  const raw = await invoke<RawFileEntry[]>('ws_list_work', { workspace })
  return raw.map(toEntry)
}

export async function readDocument(workspace: string, name: string): Promise<string> {
  return invoke<string>('ws_read', { workspace, name })
}

export async function writeDocument(workspace: string, name: string, content: string): Promise<void> {
  await invoke('ws_write', { workspace, name, content })
}

export async function renameDocument(workspace: string, from: string, to: string): Promise<void> {
  await invoke('ws_rename', { workspace, from, to })
}

export async function deleteDocument(workspace: string, name: string): Promise<void> {
  await invoke('ws_delete', { workspace, name })
}

export async function stashDocument(workspace: string, name: string): Promise<string> {
  return invoke<string>('ws_stash', { workspace, name })
}

export async function restoreStash(workspace: string, name: string): Promise<string> {
  return invoke<string>('ws_restore_stash', { workspace, name })
}

export async function deleteStash(workspace: string, name: string): Promise<void> {
  await invoke('ws_delete_stash', { workspace, name })
}

interface RawSearchHit {
  name: string
  mtime_ms: number
}

export async function searchDocuments(workspace: string, query: string): Promise<FileEntry[]> {
  const raw = await invoke<RawSearchHit[]>('ws_search', { workspace, query })
  return raw.map((r) => ({
    name: r.name,
    title: parseFilename(r.name)?.title ?? '',
    mtimeMs: r.mtime_ms,
  }))
}
