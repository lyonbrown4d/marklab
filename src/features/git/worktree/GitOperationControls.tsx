import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/useI18n'
import type { GitOperationState } from '@/types/gitOperations'

export const GitOperationControls = ({
  operation,
  busy,
  hasConflicts,
  error,
  onContinue,
  onAbort,
}: {
  operation: GitOperationState['operation'] | undefined
  busy: boolean
  hasConflicts: boolean
  error: unknown
  onContinue: () => void
  onAbort: (operation: NonNullable<GitOperationState['operation']>) => void
}) => {
  const { t } = useI18n()
  if (error)
    return (
      <p role="alert" className="px-2 text-xs text-destructive">
        {String(error)}
      </p>
    )
  if (!operation) return null
  return (
    <div className="flex flex-col gap-1 px-2 text-xs">
      <p>{t('scm.operationPending', { operation: t(`scm.management.operation.${operation}`) })}</p>
      <div className="flex gap-1">
        <Button size="sm" variant="secondary" disabled={busy || hasConflicts} onClick={onContinue}>
          {t('scm.continueOperation')}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAbort(operation)}>
          {t('scm.abortOperation')}
        </Button>
      </div>
    </div>
  )
}
