import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { useNativeSurfaceOcclusion } from '@/app/nativeSurfaceOcclusion'
import { useI18n } from '@/i18n/useI18n'
import { useGitManagement } from '@/features/git/management/useGitManagement'
import { GitHistoryTab } from '@/components/git/GitHistoryTab'
import { GitBranchesTab } from '@/components/git/GitBranchesTab'
import { GitStashTab } from '@/components/git/GitStashTab'
import { GitQueryState } from '@/components/git/GitQueryState'

type Props = { open: boolean; onOpenChange: (open: boolean) => void; rootPath: string }

const RepositoryManagement = ({ open, onOpenChange, rootPath }: Props) => {
  const { t } = useI18n()
  const [tab, setTab] = useState('history')
  const { operation, pending, error, run } = useGitManagement(rootPath, open)
  const blocked = pending || !operation.isSuccess || Boolean(operation.data.operation)
  const actions = { rootPath, run, pending, error, disabled: blocked }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next)
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(760px,90vh)] min-h-0 flex-col gap-3 border-border p-4 sm:max-w-5xl"
        aria-busy={pending}
      >
        <DialogHeader className="shrink-0 text-left">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle>{t('scm.management.title')}</DialogTitle>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              {t('scm.management.close')}
            </Button>
          </div>
          <DialogDescription className="sr-only">
            {t('scm.management.description')}
          </DialogDescription>
        </DialogHeader>
        <GitQueryState
          loading={operation.isLoading}
          error={operation.error}
          onRetry={() => {
            void operation.refetch()
          }}
        />
        {operation.data?.operation && (
          <p role="status" className="rounded-md border border-amber-500/40 p-2 text-xs">
            {t('scm.management.operationPending', {
              operation: t(`scm.management.operation.${operation.data.operation}`),
            })}
          </p>
        )}
        {pending && (
          <p role="status" className="text-xs text-muted-foreground">
            {t('scm.management.working')}
          </p>
        )}
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error instanceof Error ? error.message : String(error)}
          </p>
        ) : null}
        <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1">
          <TabsList aria-label={t('scm.management.title')}>
            {(['history', 'branches', 'stash'] as const).map((name) => (
              <TabsTrigger key={name} value={name}>
                {t(`scm.${name}.title`)}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="history" className="min-h-0 overflow-hidden">
            <GitHistoryTab {...actions} />
          </TabsContent>
          <TabsContent value="branches" className="min-h-0 overflow-y-auto">
            <GitBranchesTab {...actions} />
          </TabsContent>
          <TabsContent value="stash" className="min-h-0 overflow-y-auto">
            <GitStashTab {...actions} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

export const GitManagementDialog = (props: Props) => {
  useNativeSurfaceOcclusion('git-management-dialog', props.open, { blocksCommandPalette: true })
  return <RepositoryManagement key={props.rootPath} {...props} />
}
