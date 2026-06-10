const FORBIDDEN = /[\/\\:*?"<>|\n\t\r]/g
const MAX_TITLE_LEN = 40

export function generateId(): string {
  // crypto.randomUUID 由来の衝突しない短い id
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return uuid.replace(/-/g, '').slice(0, 10)
  // フォールバック（テスト環境等で crypto 不在時）
  return Array.from({ length: 10 }, () => Math.floor(Math.random() * 36).toString(36)).join('')
}

export function sanitizeTitle(title: string): string {
  const cleaned = title.replace(FORBIDDEN, '_').trim()
  // コードポイント単位で切り詰め（サロゲートペアを割らない）
  const points = Array.from(cleaned)
  const truncated = points.length > MAX_TITLE_LEN ? points.slice(0, MAX_TITLE_LEN).join('') : cleaned
  // 末尾のドット/空白を除去（Windows 等で不正）
  return truncated.replace(/[.\s]+$/u, '')
}

export function buildFilename(title: string, id: string): string {
  const safe = sanitizeTitle(title)
  const head = safe || 'untitled'
  return `${head}_${id}.md`
}

export function parseFilename(filename: string): { title: string; id: string } | null {
  const m = filename.match(/^(.*?)_([0-9a-z-]{6,})\.md$/)
  if (!m) return null
  const title = m[1] === 'untitled' ? '' : m[1]
  return { title, id: m[2] }
}

export function extractFirstH1(markdown: string): string {
  const match = markdown.match(/^# (.+)$/m)
  return match ? match[1].trim() : ''
}
