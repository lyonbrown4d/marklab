import { Badge } from '@/components/ui/badge'
import { SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar'
import { GitChangeRow } from '@/components/GitChangeRow'
import { useI18n } from '@/i18n/useI18n'
import type { GitDiffRequest, GitFileChange } from '@/services/gitApi'

export type ScmChangeGroup = {
  id: GitDiffRequest['section']
  label: string
  changes: GitFileChange[]
}

type ScmChangeGroupsProps = {
  groups: ScmChangeGroup[]
  onOpenDiff: (request: GitDiffRequest) => void
}

export const ScmChangeGroups = ({ groups, onOpenDiff }: ScmChangeGroupsProps) => {
  const { t } = useI18n()

  return (
    <SidebarMenu className="flex flex-col gap-2">
      {groups.map((group) => {
        const groupLabelId = `scm-${group.id}-label`

        return (
          <SidebarMenuItem key={group.id} className="flex flex-col gap-1">
            <div className="flex h-6 items-center justify-between px-2 text-[11px] font-medium uppercase text-muted-foreground">
              <span id={groupLabelId}>{group.label}</span>
              <Badge variant="secondary" className="h-5 rounded px-1.5 py-0">
                {group.changes.length}
              </Badge>
            </div>
            <div role="group" aria-labelledby={groupLabelId} className="flex flex-col gap-1 px-1">
              {group.changes.slice(0, 8).map((change) => (
                <GitChangeRow
                  key={`${group.id}:${change.path}:${change.status}`}
                  change={change}
                  section={group.id}
                  onOpenDiff={onOpenDiff}
                  diffLabel={t('scm.openDiff')}
                  renamedFromLabel={t('scm.renamedFrom')}
                />
              ))}
              {group.changes.length > 8 && (
                <div className="px-2 text-[11px] text-muted-foreground">
                  {t('scm.moreChanges', {
                    count: String(group.changes.length - 8),
                  })}
                </div>
              )}
            </div>
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}
