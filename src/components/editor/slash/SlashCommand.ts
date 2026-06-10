import { Extension, ReactRenderer } from '@tiptap/react'
import Suggestion from '@tiptap/suggestion'
import tippy, { Instance as TippyInstance } from 'tippy.js'
import { filterSlashItems, SlashItem } from './items'
import { SlashMenu, SlashMenuRef } from './SlashMenu'

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        // ブロック先頭（＝空行）の "/" でだけ発火させる。行途中で出すための「直前スペース」
        // が不要になり、コマンド実行後に余分なスペースが残る違和感を根本から防ぐ。
        startOfLine: true,
        allow: ({ editor }: { editor: import('@tiptap/react').Editor }) => !editor.isActive('codeBlock'),
        command: ({ editor, range, props }: { editor: import('@tiptap/react').Editor; range: import('@tiptap/react').Range; props: SlashItem }) => {
          props.command({ editor, range })
        },
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
        items: ({ query }: { query: string }) => filterSlashItems(query),
        render: () => {
          let component: ReactRenderer<SlashMenuRef> | null = null
          let popup: TippyInstance[] = []

          return {
            onStart: (props: {
              editor: import('@tiptap/react').Editor
              clientRect?: (() => DOMRect | null) | null
              items: SlashItem[]
              command: (item: SlashItem) => void
              range: import('@tiptap/react').Range
            }) => {
              component = new ReactRenderer(SlashMenu, {
                props,
                editor: props.editor,
              })

              if (!props.clientRect) return

              popup = tippy('body', {
                getReferenceClientRect: () => {
                  const rect = props.clientRect?.()
                  return rect ?? new DOMRect(0, 0, 0, 0)
                },
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
                offset: [0, 6],
              })
            },
            onUpdate: (props: {
              clientRect?: (() => DOMRect | null) | null
              items: SlashItem[]
              command: (item: SlashItem) => void
            }) => {
              component?.updateProps(props)
              if (!props.clientRect) return
              popup[0]?.setProps({
                getReferenceClientRect: () => {
                  const rect = props.clientRect?.()
                  return rect ?? new DOMRect(0, 0, 0, 0)
                },
              })
            },
            onKeyDown: (props: { event: KeyboardEvent }) => {
              if (props.event.key === 'Escape') {
                popup[0]?.hide()
                return true
              }
              return component?.ref?.onKeyDown(props) ?? false
            },
            onExit: () => {
              popup[0]?.destroy()
              component?.destroy()
            },
          }
        },
      }),
    ]
  },
})
