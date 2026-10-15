import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { useI18n } from '@/i18n/useI18n'
import { gitApiForWorkspace } from '@/services/gitApi'
import type { GitBranchSummary } from '@/types/gitOperations'
import type { GitManagementActions } from '@/features/git/management/useGitManagement'
import { GitActionDialog } from '@/components/git/GitActionDialog'
import { GitQueryState } from '@/components/git/GitQueryState'
import { useGitRefreshOptions } from '@/features/git/useGitRefreshOptions'

type BranchAction = { type: 'delete' | 'merge' | 'rebase'; branch: GitBranchSummary }

export const GitBranchesTab = ({
  rootPath,
  disabled,
  pending,
  error,
  run,
}: GitManagementActions) => {
  const { t } = useI18n()
  const api = useMemo(() => gitApiForWorkspace(rootPath), [rootPath])
  const [name, setName] = useState('')
  const [startPoint, setStartPoint] = useState('')
  const [action, setAction] = useState<BranchAction | null>(null)
  const [force, setForce] = useState(false)
  const refresh = useGitRefreshOptions(rootPath)
  const query = useQuery({
    ...refresh,
    queryKey: ['git-branches', rootPath],
    queryFn: () => api.getBranches(),
  })
  const current = query.data?.find((branch) => branch.current)?.name
  const confirm = async () => {
    if (!action || disabled) return
    const successful = await run(() =>
      action.type === 'delete'
        ? api.deleteBranch(action.branch.name, force)
        : action.type === 'merge'
          ? api.merge(action.branch.name)
          : api.rebase(action.branch.name),
    )
    if (successful) setAction(null)
  }
  return (
    <div className="space-y-3 text-xs">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (!name.trim() || disabled) return
          void run(() => api.createBranch(name.trim(), startPoint.trim() || undefined)).then(
            (success) => {
              if (success) {
                setName('')
                setStartPoint('')
              }
            },
          )
        }}
      >
        <Input
          aria-label={t('scm.branches.name')}
          placeholder={t('scm.branches.name')}
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={disabled}
          className="h-8 min-w-40 flex-1 text-xs"
        />
        <Input
          aria-label={t('scm.branches.startPoint')}
          placeholder={t('scm.branches.startPoint')}
          value={startPoint}
          onChange={(event) => setStartPoint(event.target.value)}
          disabled={disabled}
          className="h-8 min-w-40 flex-1 text-xs"
        />
        <Button size="sm" type="submit" disabled={disabled || !name.trim()}>
          {t('scm.branches.create')}
        </Button>
      </form>
      <p className="text-muted-foreground">{t('scm.branches.cleanHelp')}</p>
      <GitQueryState
        loading={query.isLoading}
        error={query.error}
        empty={query.data?.length === 0}
        onRetry={() => {
          void query.refetch()
        }}
      />
      <ul className="divide-y divide-border">
        {query.data?.map((branch) => (
          <li
            key={`${branch.remote}:${branch.name}`}
            className="flex flex-wrap items-center gap-2 py-2"
          >
            <span className="min-w-32 flex-1 break-all font-mono">{branch.name}</span>
            <span className="text-muted-foreground">
              {branch.current
                ? t('scm.branches.current')
                : branch.remote
                  ? t('scm.branches.remote')
                  : t('scm.branches.local')}
            </span>
            {branch.remote ? (
              <Button
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => {
                  setStartPoint(branch.name)
                  setName(branch.name.replace(/^[^/]+\//, ''))
                }}
              >
                {t('scm.branches.createLocal')}
              </Button>
            ) : (
              !branch.current && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => {
                      void run(() => api.switchBranch(branch.name))
                    }}
                  >
                    {t('scm.branches.switch')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => {
                      setForce(false)
                      setAction({ type: 'delete', branch })
                    }}
                  >
                    {t('scm.branches.delete')}
                  </Button>
                </>
              )
            )}
            {!branch.current && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled || !current}
                  onClick={() => setAction({ type: 'merge', branch })}
                >
                  {t('scm.branches.merge')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled || !current}
                  onClick={() => setAction({ type: 'rebase', branch })}
                >
                  {t('scm.branches.rebase')}
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
      {action && (
        <GitActionDialog
          title={t(`scm.branches.${action.type}`)}
          description={t(`scm.branches.${action.type}Confirm`, {
            branch: action.branch.name,
            current,
          })}
          pending={pending}
          error={error}
          confirmDisabled={disabled}
          destructive={action.type === 'delete' || action.type === 'rebase'}
          onCancel={() => setAction(null)}
          onConfirm={() => {
            void confirm()
          }}
        >
          {action.type === 'delete' && (
            <label className="flex items-start gap-2 text-xs">
              <Checkbox
                checked={force}
                disabled={pending}
                onCheckedChange={(checked) => setForce(checked === true)}
              />
              {t('scm.branches.forceWarning')}
            </label>
          )}
        </GitActionDialog>
      )}
    </div>
  )
}
