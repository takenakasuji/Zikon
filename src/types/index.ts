export interface FileEntry {
  name: string
  title: string
  mtimeMs: number
}

export interface Document {
  /** filename only, e.g. "設計メモ_abc123.md" */
  name: string
  /** parsed title from filename */
  title: string
  /** id portion of filename */
  id: string
  /** markdown content */
  content: string
}
