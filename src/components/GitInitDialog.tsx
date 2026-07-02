import { GitBranchPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { useI18n } from '@/i18n/useI18n'

type GitInitDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isInitializing: boolean
  error: unknown
}

export const GitInitDialog = ({
  open,
  onOpenChange,
  onConfirm,
  isInitializing,
  error,
}: GitInitDialogProps) => {
  const { t } = useI18n()
  const errorMessage = error ? String(error) : ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" aria-busy={isInitializing ? 'true' : undefined}>
        <DialogHeader>
          <DialogTitle>{t('scm.init')}</DialogTitle>
          <DialogDescription>{t('scm.initConfirm')}</DialogDescription>
        </DialogHeader>
        {errorMessage ? (
          <div
            role="alert"
            aria-live="assertive"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {errorMessage}
          </div>
        ) : null}
        {isInitializing ? (
          <span className="sr-only" role="status">
            {t('scm.initializing')}
          </span>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={isInitializing}
            onClick={() => onOpenChange(false)}
          >
            {t('scm.cancel')}
          </Button>
          <Button type="button" disabled={isInitializing} onClick={onConfirm}>
            {isInitializing ? (
              <Spinner data-icon="inline-start" aria-hidden="true" />
            ) : (
              <GitBranchPlus data-icon="inline-start" aria-hidden="true" />
            )}
            {isInitializing ? t('scm.initializing') : t('scm.init')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
