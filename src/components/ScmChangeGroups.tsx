import { useId } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar'
import { GitChangeRow } from '@/components/GitChangeRow'
import { useI18n } from '@/i18n/useI18n'
import type { GitDiffRequest, GitFileChange } from '@/services/gitApi'

export type ScmChangeGroup = {
  id: GitDiffRequest['section']
  label: string
  changes: GitFileChange[]
}

export type ScmChangeActions = {
  busy: boolean
  onStage: (paths: string[]) => void
  onUnstage: (paths: string[]) => void
  onDiscard: (paths: string[]) => void
  onOpenFile?: (path: string) => void
}

type ScmChangeGroupsProps = Partial<ScmChangeActions> & {
  groups: ScmChangeGroup[]
  onOpenDiff: (request: GitDiffRequest) => void
}

export const ScmChangeGroups = ({
  groups,
  onOpenDiff,
  busy,
  onStage,
  onUnstage,
  onDiscard,
}: ScmChangeGroupsProps) => {
  const { t } = useI18n()
  const instanceId = useId()
  return (
    <SidebarMenu className="flex max-h-96 flex-col gap-2 overflow-y-auto">
      {groups.map((group) => {
        const groupLabelId = `${instanceId}-${group.id}-label`
        const isStaged = group.id === 'staged'
        const action = isStaged ? onUnstage : onStage
        const paths = group.changes.map(({ path }) => path)
        return (
          <SidebarMenuItem key={group.id} className="flex flex-col gap-0.5">
            <div className="flex h-6 items-center justify-between gap-1 px-2 text-[11px] font-medium text-muted-foreground">
              <span id={groupLabelId} className="min-w-0 flex-1 truncate uppercase">
                {group.label}
              </span>
              <Badge variant="secondary" className="h-5 rounded px-1.5 py-0">
                {group.changes.length}
              </Badge>
              {action && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1 text-[11px]"
                  disabled={busy}
                  onClick={() => action(paths)}
                >
                  {t(isStaged ? 'scm.unstageAll' : 'scm.stageAll')}
                </Button>
              )}
            </div>
            {group.id === 'conflicts' && (
              <p className="px-2 text-[11px] text-muted-foreground">{t('scm.conflictHelp')}</p>
            )}
            <div role="group" aria-labelledby={groupLabelId} className="flex flex-col gap-0.5 px-1">
              {group.changes.map((change) => (
                <GitChangeRow
                  key={`${group.id}:${change.path}:${change.status}`}
                  change={change}
                  section={group.id}
                  onOpenDiff={onOpenDiff}
                  diffLabel={t(group.id === 'conflicts' ? 'scm.resolveConflict' : 'scm.openDiff')}
                  renamedFromLabel={t('scm.renamedFrom')}
                  busy={busy}
                  actionLabel={t(isStaged ? 'scm.unstage' : 'scm.stage')}
                  discardLabel={t('scm.discard')}
                  openFileLabel={t('scm.openFile')}
                  onAction={action ? () => action([change.path]) : undefined}
                  onDiscard={
                    onDiscard && group.id !== 'conflicts'
                      ? () => onDiscard([change.path])
                      : undefined
                  }
                />
              ))}
            </div>
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}
