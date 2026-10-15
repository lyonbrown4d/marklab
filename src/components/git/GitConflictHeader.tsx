import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/useI18n'

type Props = {
  path: string
  dirty: boolean | null
  pending: boolean
  canSave: boolean
  unresolved: boolean
  onSave: (stage: boolean) => void
  onClose: () => void
}

export const GitConflictHeader = ({
  path,
  dirty,
  pending,
  canSave,
  unresolved,
  onSave,
  onClose,
}: Props) => {
  const { t } = useI18n()
  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
      <div className="min-w-0 flex-1 text-xs">
        <h2 className="truncate font-medium">
          {t('scm.merge.title')}: {path}
        </h2>
        {dirty !== null && (
          <p className="text-muted-foreground">
            {t(dirty ? 'scm.merge.unsaved' : 'scm.merge.saved')}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap gap-1">
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !canSave}
          onClick={() => onSave(false)}
        >
          {t('scm.merge.save')}
        </Button>
        <Button size="sm" disabled={pending || !canSave || unresolved} onClick={() => onSave(true)}>
          {t('scm.merge.saveAndStage')}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={onClose}>
          {t('scm.management.close')}
        </Button>
      </div>
    </header>
  )
}
