import { AlertCircle } from 'lucide-react'
import AppAlert from '@/components/AppAlert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useI18n } from '@/i18n/useI18n'

type CommandAnalysisStateProps = {
  error: boolean
  loading: boolean
  onRetry: () => Promise<unknown>
}

const CommandAnalysisState = ({ error, loading, onRetry }: CommandAnalysisStateProps) => {
  const { t } = useI18n()

  if (error) {
    return (
      <AppAlert
        aria-live="assertive"
        className="mx-2 mt-2 px-2 py-1.5"
        descriptionClassName="flex items-center justify-between gap-3 text-xs"
        icon={<AlertCircle aria-hidden="true" className="size-3.5" />}
        role="alert"
        tone="destructive"
      >
        <span>{t('command.analysis.error')}</span>
        <Button size="sm" variant="outline" onClick={() => void onRetry()}>
          {t('actions.retry')}
        </Button>
      </AppAlert>
    )
  }

  if (!loading) return null
  return (
    <AppAlert
      aria-live="polite"
      className="mx-2 mt-2 bg-muted/35 px-2 py-1.5 text-muted-foreground"
      descriptionClassName="text-xs"
      icon={<Spinner aria-hidden="true" className="size-3.5" role="presentation" />}
      role="status"
    >
      {t('command.analysis.loading')}
    </AppAlert>
  )
}

export default CommandAnalysisState
