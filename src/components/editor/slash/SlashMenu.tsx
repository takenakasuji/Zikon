'use client'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { SearchX } from 'lucide-react'
import type { Editor, Range } from '@tiptap/react'
import { cn } from '@/lib/cn'
import type { SlashItem } from './items'

export interface SlashMenuRef {
  onKeyDown: (event: { event: KeyboardEvent }) => boolean
}

interface SlashMenuProps {
  items: SlashItem[]
  command: (item: SlashItem) => void
  editor: Editor
  range: Range
}

export const SlashMenu = forwardRef<SlashMenuRef, SlashMenuProps>(function SlashMenu(
  { items, command },
  ref,
) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [scrolling, setScrolling] = useState(false)
  const [kbdNav, setKbdNav] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const scrollHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => setSelectedIndex(0), [items])

  useEffect(() => {
    const el = itemRefs.current[selectedIndex]
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  useEffect(() => {
    return () => {
      if (scrollHideTimer.current) clearTimeout(scrollHideTimer.current)
    }
  }, [])

  const handleWheel = () => {
    setScrolling(true)
    if (scrollHideTimer.current) clearTimeout(scrollHideTimer.current)
    scrollHideTimer.current = setTimeout(() => setScrolling(false), 700)
  }

  const select = (index: number) => {
    const item = items[index]
    if (item) command(item)
  }

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') {
        setKbdNav(true)
        setSelectedIndex((i) => (i + items.length - 1) % items.length)
        return true
      }
      if (event.key === 'ArrowDown') {
        setKbdNav(true)
        setSelectedIndex((i) => (i + 1) % items.length)
        return true
      }
      if (event.key === 'Enter') {
        select(selectedIndex)
        return true
      }
      return false
    },
  }))

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--popover)] px-3 py-2 text-sm text-[var(--muted-foreground)] shadow-popover">
        <SearchX size={15} strokeWidth={1.5} />
        <span>No results</span>
      </div>
    )
  }

  return (
    <div
      ref={listRef}
      onWheel={handleWheel}
      onMouseMove={() => { if (kbdNav) setKbdNav(false) }}
      className={`max-h-80 w-72 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--popover)] p-1 shadow-popover ${
        scrolling ? 'slash-scrollbar-visible' : 'slash-scrollbar-hidden'
      }`}
    >
      {items.map((item, index) => {
        const showHeader = index === 0 || items[index - 1].group !== item.group
        return (
          <div key={item.title}>
            {showHeader && (
              <div className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                {item.group}
              </div>
            )}
            <button
              ref={(el) => { itemRefs.current[index] = el }}
              type="button"
              onClick={() => select(index)}
              onMouseEnter={() => { if (!kbdNav) setSelectedIndex(index) }}
              className={cn(
                'flex w-full items-start gap-3 rounded px-2 py-1.5 text-left transition-colors',
                index === selectedIndex
                  ? 'bg-[var(--accent)]'
                  : kbdNav ? '' : 'hover:bg-[var(--accent)]',
              )}
            >
              <span className="mt-0.5 inline-flex size-7 flex-shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)]">
                <item.icon size={15} strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-[var(--foreground)]">{item.title}</span>
                <span className="block truncate text-xs text-[var(--muted-foreground)]">{item.description}</span>
              </span>
            </button>
          </div>
        )
      })}
    </div>
  )
})
