import { AlertCircle, RefreshCw } from 'lucide-react'

import AppEmptyState from '@/components/AppEmptyState'
import { DocumentLoadingState } from '@/components/loading/DocumentLoadingState'
import { Button } from '@/components/ui/button'

type Props = {
  error: unknown
  loading: boolean
  onRetry: () => Promise<unknown>
  t: (key: string) => string
}

export const AllPagesIndexState = ({ error, loading, onRetry, t }: Props) => {
  if (loading) {
    return (
      <DocumentLoadingState
        className="rounded-xl border border-dashed p-6"
        label={t('allPages.loadingTitle')}
        description={t('allPages.loadingDescription')}
      />
    )
  }
  if (!error) return null

  return (
    <AppEmptyState
      compact
      role="alert"
      title={t('allPages.errorTitle')}
      description={error instanceof Error ? error.message : t('allPages.errorDescription')}
      icon={<AlertCircle aria-hidden="true" />}
      action={
        <Button type="button" size="sm" variant="outline" onClick={() => void onRetry()}>
          <RefreshCw data-icon="inline-start" />
          {t('actions.retry')}
        </Button>
      }
    />
  )
}
