import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useNativeSurfaceOcclusion } from '@/app/nativeSurfaceOcclusion'
import { useI18n } from '@/i18n/useI18n'

export type GitConfirmation =
  | { type: 'discard'; paths: string[]; deletesUntracked: boolean }
  | { type: 'abort'; operation: string }
  | { type: 'removeRemote'; name: string }
  | { type: 'setRemote'; name: string; url: string }

export const GitWorktreeConfirm = ({
  confirmation,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  confirmation: GitConfirmation | null
  busy: boolean
  error: unknown
  onClose: () => void
  onConfirm: () => void
}) => {
  const { t } = useI18n()
  useNativeSurfaceOcclusion('git-worktree-confirm', Boolean(confirmation), {
    blocksCommandPalette: true,
  })
  const title =
    confirmation?.type === 'discard'
      ? t('scm.discard')
      : confirmation?.type === 'abort'
        ? t('scm.abortOperation')
        : confirmation?.type === 'setRemote'
          ? t('scm.saveRemote')
          : t('scm.removeRemote')
  return (
    <Dialog
      open={Boolean(confirmation)}
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent
        aria-busy={busy}
        className="max-h-[85vh] max-w-md overflow-y-auto border-border"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {confirmation?.type === 'discard'
              ? t('scm.discardWarning')
              : confirmation?.type === 'abort'
                ? t('scm.abortWarning', {
                    operation: t(`scm.management.operation.${confirmation.operation}`),
                  })
                : confirmation?.type === 'setRemote'
                  ? t('scm.setRemoteWarning', { name: confirmation.name, url: confirmation.url })
                  : t('scm.removeRemoteWarning', { name: confirmation?.name ?? '' })}
          </DialogDescription>
        </DialogHeader>
        {confirmation?.type === 'discard' && (
          <>
            <ul className="max-h-48 overflow-auto text-xs">
              {confirmation.paths.map((path) => (
                <li key={path} className="break-all py-0.5">
                  {path}
                </li>
              ))}
            </ul>
            {confirmation.deletesUntracked && (
              <p className="text-xs text-destructive">{t('scm.discardUntrackedWarning')}</p>
            )}
          </>
        )}
        {error ? (
          <p role="alert" className="break-words text-xs text-destructive">
            {String(error)}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {t('scm.cancel')}
          </Button>
          <Button variant="destructive" disabled={busy} onClick={onConfirm}>
            {title}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
