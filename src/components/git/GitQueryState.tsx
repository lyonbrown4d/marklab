import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/useI18n'

type Props = {
  loading: boolean
  error: unknown
  empty?: boolean
  onRetry?: () => void
}

export const GitQueryState = ({ loading, error, empty, onRetry }: Props) => {
  const { t } = useI18n()
  if (loading)
    return (
      <p role="status" className="p-3 text-xs text-muted-foreground">
        {t('scm.management.loading')}
      </p>
    )
  if (error)
    return (
      <div role="alert" className="p-3 text-xs text-destructive">
        <p>{error instanceof Error ? error.message : String(error)}</p>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            {t('scm.management.retry')}
          </Button>
        )}
      </div>
    )
  if (empty) return <p className="p-3 text-xs text-muted-foreground">{t('scm.management.empty')}</p>
  return null
}
