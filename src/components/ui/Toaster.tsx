'use client'
import { useToastStore } from '@/store/toastStore'
import { cn } from '@/lib/cn'

const KIND_CLASS: Record<string, string> = {
  info: 'border-[var(--border)] text-[var(--foreground)]',
  success: 'border-[var(--primary)] text-[var(--foreground)]',
  error: 'border-[var(--danger)] text-[var(--danger)]',
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  if (toasts.length === 0) return null
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-toast flex flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={cn(
            'pointer-events-auto max-w-sm rounded-md border bg-[var(--popover)] px-4 py-2.5 text-left text-sm shadow-popover',
            KIND_CLASS[t.kind] ?? KIND_CLASS.info,
          )}
        >
          {t.message}
        </button>
      ))}
    </div>
  )
}
