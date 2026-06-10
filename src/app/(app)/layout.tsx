import { Sidebar } from '@/components/layout/Sidebar'
import { Toaster } from '@/components/ui/Toaster'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { CommandPalette } from '@/components/command/CommandPalette'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
      <Toaster />
      <ConfirmDialog />
      <CommandPalette />
    </div>
  )
}
