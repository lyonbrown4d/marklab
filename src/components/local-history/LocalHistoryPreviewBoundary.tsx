import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { ErrorBoundary } from 'react-error-boundary'
import AppAlert from '@/components/AppAlert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type LocalHistoryPreviewBoundaryProps = {
  children: ReactNode
  closeLabel: string
  description: string
  errorTitle: string
  path: string
  retryLabel: string
  onClose: () => void
  onRetry: () => void
}

const LocalHistoryPreviewBoundary = ({
  children,
  closeLabel,
  description,
  errorTitle,
  path,
  retryLabel,
  onClose,
  onRetry,
}: LocalHistoryPreviewBoundaryProps) => (
  <ErrorBoundary
    onReset={onRetry}
    fallbackRender={({ error, resetErrorBoundary }) => (
      <Dialog
        open
        onOpenChange={(nextOpen) => {
          if (!nextOpen) onClose()
        }}
      >
        <DialogContent className="flex max-w-lg flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border/70 px-5 py-4 pr-12">
            <DialogTitle className="text-base">{errorTitle}</DialogTitle>
            <DialogDescription className="truncate">
              {description} · {path}
            </DialogDescription>
          </DialogHeader>
          <div className="p-5">
            <AppAlert
              role="alert"
              tone="destructive"
              title={errorTitle}
              icon={<AlertTriangle aria-hidden="true" />}
            >
              {error instanceof Error ? error.message : String(error)}
            </AppAlert>
          </div>
          <DialogFooter className="border-t border-border/70 px-5 py-3">
            <Button type="button" variant="outline" onClick={onClose}>
              {closeLabel}
            </Button>
            <Button type="button" onClick={resetErrorBoundary}>
              {retryLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )}
  >
    {children}
  </ErrorBoundary>
)

export default LocalHistoryPreviewBoundary
