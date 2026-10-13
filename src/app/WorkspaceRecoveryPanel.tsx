import { FolderOpen, RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { useI18n } from '@/i18n/useI18n'
import type { WorkspaceRestoreFailure } from '@/app/workspaceRestoreTypes'
import type { WorkspaceRecoveryAction } from '@/app/useWorkspaceRecoveryActions'

type WorkspaceRecoveryPanelProps = {
  failure: WorkspaceRestoreFailure
  busyAction: WorkspaceRecoveryAction | null
  restoring?: boolean
  error: string | null
  onRecover: (action: WorkspaceRecoveryAction) => Promise<void>
}

export const WorkspaceRecoveryPanel = ({
  failure,
  busyAction,
  restoring = false,
  error,
  onRecover,
}: WorkspaceRecoveryPanelProps) => {
  const { t } = useI18n()
  const busy = busyAction !== null || restoring

  return (
    <div className="flex h-full min-h-0 items-center justify-center overflow-auto bg-background p-6">
      <Card className="w-full max-w-xl py-6">
        <CardContent className="flex flex-col gap-4 px-6">
          <div role="alert" className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <TriangleAlert className="size-5 shrink-0 text-destructive" aria-hidden="true" />
              <h1 className="text-base font-semibold">{failure.message}</h1>
            </div>
            <p className="text-sm text-muted-foreground">{t('app.workspaceRecoveryDescription')}</p>
            <p className="break-all rounded-md border bg-muted/40 p-3 text-sm" dir="auto">
              {failure.rootPath || t('sidebar.localWorkspace')}
            </p>
            <p className="break-words text-xs text-muted-foreground">{failure.detail}</p>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {busy ? (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="size-4" aria-hidden="true" />
              {t('app.workspaceRecoveryPending')}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void onRecover('retry')}>
              <RefreshCw aria-hidden="true" />
              {t('app.restoreRetry')}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void onRecover('relocate')}>
              <FolderOpen aria-hidden="true" />
              {t('app.workspaceRecoveryRelocate')}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void onRecover('open')}>
              {t('app.workspaceRecoveryOpenAnother')}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void onRecover('internal')}>
              {t('app.workspaceRecoveryUseDefault')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
