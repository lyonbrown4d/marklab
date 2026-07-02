import { useId } from 'react'
import { Plus } from 'lucide-react'
import AppAlert from '@/components/AppAlert'
import AppButton from '@/components/AppButton'
import { Spinner } from '@/components/ui/spinner'
import { useI18n } from '@/i18n/useI18n'

type GitRepositoryEmptyStateProps = {
  isInitializing: boolean
  initError: unknown
  onOpenInitDialog: () => void
}

export const GitRepositoryEmptyState = ({
  isInitializing,
  initError,
  onOpenInitDialog,
}: GitRepositoryEmptyStateProps) => {
  const { t } = useI18n()
  const errorId = useId()
  const errorMessage = initError ? String(initError) : ''

  return (
    <div className="flex flex-col gap-2 px-2 pb-2 text-xs" aria-busy={isInitializing}>
      <div className="rounded-md border border-sidebar-border/70 bg-sidebar-accent/30 p-2">
        <div className="font-medium text-sidebar-foreground">{t('scm.notRepositoryTitle')}</div>
        <div className="mt-1 text-muted-foreground">{t('scm.notRepositoryHelp')}</div>
      </div>
      <AppButton
        type="button"
        variant="secondary"
        size="sm"
        className="h-7 w-full justify-start rounded-md px-2 text-xs"
        disabled={isInitializing}
        aria-describedby={errorMessage ? errorId : undefined}
        onClick={onOpenInitDialog}
      >
        {isInitializing ? (
          <Spinner data-icon="inline-start" aria-hidden="true" />
        ) : (
          <Plus data-icon="inline-start" aria-hidden="true" />
        )}
        {isInitializing ? t('scm.initializing') : t('scm.init')}
      </AppButton>
      {isInitializing ? (
        <span className="sr-only" role="status">
          {t('scm.initializing')}
        </span>
      ) : null}
      {errorMessage ? (
        <AppAlert
          id={errorId}
          role="alert"
          aria-live="assertive"
          tone="destructive"
          className="px-2 py-1.5 text-xs"
        >
          {errorMessage}
        </AppAlert>
      ) : null}
    </div>
  )
}
