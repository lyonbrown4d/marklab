import { useId } from 'react'
import { GitBranch, Plus } from 'lucide-react'
import AppAlert from '@/components/AppAlert'
import AppButton from '@/components/AppButton'
import AppEmptyState from '@/components/AppEmptyState'
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
    <div className="flex flex-col gap-2 px-2 pb-2" aria-busy={isInitializing}>
      <AppEmptyState
        compact
        className="min-h-36 flex-none border-sidebar-border/80 bg-sidebar/40 px-4 py-5"
        description={t('scm.notRepositoryHelp')}
        descriptionClassName="max-w-[13rem] text-[11px] leading-4"
        icon={<GitBranch aria-hidden="true" />}
        mediaClassName="mb-1 border border-sidebar-border bg-background/70 text-muted-foreground"
        title={t('scm.notRepositoryTitle')}
        titleClassName="text-xs"
        titleLevel={3}
      />
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
