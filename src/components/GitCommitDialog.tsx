import { GitCommitHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/i18n/useI18n'

type GitCommitDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  branch: string
  changedFilesCount: number
  message: string
  onMessageChange: (message: string) => void
  onCommit: () => void
  canCommit: boolean
  isCommitting: boolean
  error: unknown
  disabledReason?: string
}

export const GitCommitDialog = ({
  open,
  onOpenChange,
  branch,
  changedFilesCount,
  message,
  onMessageChange,
  onCommit,
  canCommit,
  isCommitting,
  error,
  disabledReason,
}: GitCommitDialogProps) => {
  const { t } = useI18n()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('scm.commitDialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('scm.commitDialogDescription', {
              count: String(changedFilesCount),
              branch,
            })}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (!canCommit) return
            onCommit()
          }}
        >
          <div className="space-y-1.5">
            <label htmlFor="git-commit-message" className="text-sm font-medium">
              {t('scm.commitMessage')}
            </label>
            <Input
              id="git-commit-message"
              value={message}
              onChange={(event) => onMessageChange(event.target.value)}
              placeholder={t('scm.commitPlaceholder')}
              disabled={isCommitting}
              autoFocus
            />
          </div>
          {disabledReason && <div className="text-sm text-destructive">{disabledReason}</div>}
          {error ? (
            <div role="alert" className="text-sm text-destructive">
              {String(error)}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={isCommitting}
              onClick={() => onOpenChange(false)}
            >
              {t('scm.cancel')}
            </Button>
            <Button type="submit" disabled={!canCommit}>
              <GitCommitHorizontal className="h-4 w-4" />
              {isCommitting ? t('scm.committing') : t('scm.commitAll')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
