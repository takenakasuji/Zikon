import { Editor, Range } from '@tiptap/react'
import type { LucideIcon } from 'lucide-react'
import { Type, Heading1, Heading2, Heading3, List, ListOrdered, ListChecks, Quote, Code, Minus, Save, Archive } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { tiptapToMarkdown } from '@/lib/markdown/toMarkdown'

export interface SlashItem {
  title: string
  description: string
  group: string
  searchTerms: string[]
  icon: LucideIcon
  command: (props: { editor: Editor; range: Range }) => void
}

export const slashItems: SlashItem[] = [
  {
    title: 'Text',
    description: 'Plain paragraph',
    group: 'Basic blocks',
    searchTerms: ['text', 'paragraph', 'p'],
    icon: Type,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('paragraph').run()
    },
  },
  {
    title: 'Heading 1',
    description: 'Large heading',
    group: 'Basic blocks',
    searchTerms: ['heading', 'h1', '#'],
    icon: Heading1,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run()
    },
  },
  {
    title: 'Heading 2',
    description: 'Medium heading',
    group: 'Basic blocks',
    searchTerms: ['heading', 'h2', '##'],
    icon: Heading2,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run()
    },
  },
  {
    title: 'Heading 3',
    description: 'Small heading',
    group: 'Basic blocks',
    searchTerms: ['heading', 'h3', '###'],
    icon: Heading3,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run()
    },
  },
  {
    title: 'Bullet list',
    description: 'A list of items',
    group: 'List',
    searchTerms: ['bullet', 'list', 'ul'],
    icon: List,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
  },
  {
    title: 'Numbered list',
    description: 'A numbered sequence',
    group: 'List',
    searchTerms: ['ordered', 'numbered', 'list', 'ol'],
    icon: ListOrdered,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
  },
  {
    title: 'Checklist',
    description: 'Manage tasks',
    group: 'List',
    searchTerms: ['todo', 'task', 'checkbox', 'check'],
    icon: ListChecks,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run()
    },
  },
  {
    title: 'Quote',
    description: 'Quote block',
    group: 'Insert',
    searchTerms: ['quote', 'blockquote'],
    icon: Quote,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run()
    },
  },
  {
    title: 'Code block',
    description: 'With syntax highlighting',
    group: 'Insert',
    searchTerms: ['code', 'codeblock'],
    icon: Code,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
    },
  },
  {
    title: 'Divider',
    description: 'Horizontal line',
    group: 'Insert',
    searchTerms: ['divider', 'hr', 'separator'],
    icon: Minus,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run()
    },
  },
  {
    title: 'Save to Kura',
    description: 'Save the current document to Kura',
    group: 'Actions',
    searchTerms: ['save', 'kura'],
    icon: Save,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run()
      const md = tiptapToMarkdown(editor.getJSON())
      const store = useWorkspaceStore.getState()
      store.updateActiveContent(md).then(() => store.saveActive()).catch(() => {})
    },
  },
  {
    title: 'Stash document',
    description: 'Push the current content to the Stash and start a new document',
    group: 'Actions',
    searchTerms: ['stash', 'new'],
    icon: Archive,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run()
      const md = tiptapToMarkdown(editor.getJSON())
      const store = useWorkspaceStore.getState()
      store.updateActiveContent(md).then(() => store.stashActive()).catch(() => {})
    },
  },
]

export function filterSlashItems(query: string): SlashItem[] {
  if (!query) return slashItems
  const q = query.toLowerCase()
  return slashItems.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.searchTerms.some((term) => term.toLowerCase().includes(q))
  )
}
