'use client'
import { useRef } from 'react'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { useConfirmStore } from '@/store/confirmStore'
import { cn } from '@/lib/cn'

export function ConfirmDialog() {
  const request = useConfirmStore((s) => s.request)
  const resolve = useConfirmStore((s) => s.resolve)
  const confirmRef = useRef<HTMLButtonElement>(null)

  return (
    <AlertDialog.Root
      open={request !== null}
      onOpenChange={(open) => {
        // Esc / programmatic close → treat as cancel.
        if (!open) resolve(false)
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-overlay bg-black/50" />
        <AlertDialog.Popup
          initialFocus={confirmRef}
          className="animate-pop-in fixed left-1/2 top-1/2 z-overlay w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--popover)] p-5 shadow-popover"
        >
          <AlertDialog.Title
            render={<p />}
            className="text-pretty text-sm text-[var(--foreground)]"
          >
            {request?.message}
          </AlertDialog.Title>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => resolve(false)}
              className="rounded px-3 py-1.5 text-sm text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
            >
              {request?.cancelLabel ?? 'Cancel'}
            </button>
            <button
              ref={confirmRef}
              type="button"
              onClick={() => resolve(true)}
              className={cn(
                'rounded px-3 py-1.5 text-sm font-medium text-[var(--on-primary)] hover:opacity-90',
                request?.destructive ? 'bg-[var(--danger)]' : 'bg-[var(--primary)]',
              )}
            >
              {request?.confirmLabel ?? 'OK'}
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
