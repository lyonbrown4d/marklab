import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/useI18n'
import { useNativeSurfaceOcclusion } from '@/app/nativeSurfaceOcclusion'

export type ConflictDialog = 'close' | 'delete' | 'reload' | null
type Props = {
  dialog: ConflictDialog
  pending: boolean
  error: unknown
  canSave: boolean
  onCancel: () => void
  onSave: () => void
  onDiscard: () => void
  onDelete: () => void
  onReload: () => void
}
export const ConflictResolutionDialogs = ({
  dialog,
  pending,
  error,
  canSave,
  onCancel,
  onSave,
  onDiscard,
  onDelete,
  onReload,
}: Props) => {
  const { t } = useI18n()
  useNativeSurfaceOcclusion('git-conflict-confirmation', Boolean(dialog), {
    blocksCommandPalette: true,
  })
  return (
    <Dialog
      open={Boolean(dialog)}
      onOpenChange={(open) => {
        if (!open && !pending) onCancel()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-h-[85vh] overflow-auto border-border sm:max-w-md"
        aria-busy={pending}
      >
        <DialogHeader>
          <DialogTitle>{t(`scm.merge.${dialog ?? 'close'}Title`)}</DialogTitle>
          <DialogDescription>{t(`scm.merge.${dialog ?? 'close'}Description`)}</DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error instanceof Error ? error.message : String(error)}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" disabled={pending} onClick={onCancel}>
            {t('scm.cancel')}
          </Button>
          {dialog === 'close' ? (
            <>
              <Button variant="outline" disabled={pending} onClick={onDiscard}>
                {t('scm.merge.discard')}
              </Button>
              <Button disabled={pending || !canSave} onClick={onSave}>
                {t('scm.merge.save')}
              </Button>
            </>
          ) : (
            <Button
              variant="destructive"
              disabled={pending}
              onClick={dialog === 'delete' ? onDelete : onReload}
            >
              {t(dialog === 'delete' ? 'scm.merge.confirmDeletion' : 'scm.merge.discardReload')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
