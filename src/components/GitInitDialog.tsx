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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('scm.init')}</DialogTitle>
          <DialogDescription>{t('scm.initConfirm')}</DialogDescription>
        </DialogHeader>
        {error ? (
          <div role="alert" className="text-sm text-destructive">
            {String(error)}
          </div>
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
            <GitBranchPlus className="h-4 w-4" />
            {isInitializing ? t('scm.initializing') : t('scm.init')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
