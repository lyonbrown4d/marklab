import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
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

  return (
    <div className="space-y-2 px-2 pb-2 text-xs">
      <div className="rounded-md border border-sidebar-border/70 bg-sidebar-accent/30 p-2">
        <div className="font-medium text-sidebar-foreground">{t('scm.notRepositoryTitle')}</div>
        <div className="mt-1 text-muted-foreground">{t('scm.notRepositoryHelp')}</div>
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="h-7 w-full justify-start rounded-md px-2 text-xs"
        disabled={isInitializing}
        onClick={onOpenInitDialog}
      >
        <Plus className="h-4 w-4" />
        {isInitializing ? t('scm.initializing') : t('scm.init')}
      </Button>
      {initError ? <div className="text-xs text-destructive">{String(initError)}</div> : null}
    </div>
  )
}
