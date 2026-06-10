import { describe, it } from 'vitest'
import { getSchema } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { lowlight } from '@/components/editor/lowlight'
import { RawBlock } from '@/components/editor/extensions/RawBlock'
import { markdownToTiptap } from './fromMarkdown'

// markdownToTiptap の出力が、エディタ本体と同じ ProseMirror schema に対して
// 常に妥当であることを保証する（不一致は実行時 "invalid content" クラッシュになる）。
const schema = getSchema([
  StarterKit.configure({ codeBlock: false, link: false, underline: false, heading: { levels: [1, 2, 3, 4, 5, 6] } }),
  CodeBlockLowlight.configure({ lowlight, defaultLanguage: 'plaintext' }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Link.configure({ openOnClick: false, autolink: true }),
  Image.configure({ inline: false, allowBase64: true }),
  RawBlock,
])

// 過去に "invalid content" を起こした/起こしうる構造を網羅する。
const cases: Array<[string, string]> = [
  ['plain bullets', '- a\n- b'],
  ['nested bullets', '- a\n  - nested'],
  ['nested ordered', '1. a\n   1. nested'],
  ['image-only bullet', '- ![alt](http://x/p.png)'],
  ['html-only bullet', '- <div>x</div>'],
  ['table-only bullet', '- | A | B |\n  | - | - |\n  | 1 | 2 |'],
  ['tasks', '- [ ] task\n- [x] done'],
  ['task with subtask', '- [ ] task\n  - subtask'],
  ['image-only task', '- [ ] ![alt](http://x/p.png)'],
  ['blockquote', '> quote'],
  ['blockquote with list', '> - q1\n> - q2'],
  ['table', '| A | B |\n| - | - |\n| 1 | 2 |'],
  ['block html', '<div>block html</div>'],
  ['block image', '![img](http://x/p.png)'],
  ['loose item', '- item with\n\n  second paragraph'],
  ['heading then list', '# h\n\n- a'],
  ['code fence', '```\ncode\n```'],
  ['reference link', 'see [t][ref] x\n\n[ref]: http://e.com'],
]

describe('markdownToTiptap output is valid against the editor schema', () => {
  for (const [name, md] of cases) {
    it(name, () => {
      // schema.nodeFromJSON(...).check() throws on schema-invalid content.
      schema.nodeFromJSON(markdownToTiptap(md)).check()
    })
  }
})
