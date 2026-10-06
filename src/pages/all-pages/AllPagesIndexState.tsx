import { AlertCircle, LoaderCircle, RefreshCw } from 'lucide-react'

import AppEmptyState from '@/components/AppEmptyState'
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
      <AppEmptyState
        compact
        role="status"
        title={t('allPages.loadingTitle')}
        description={t('allPages.loadingDescription')}
        icon={<LoaderCircle className="animate-spin" aria-hidden="true" />}
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
