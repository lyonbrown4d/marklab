import { Check, FolderOpen, RotateCw, Trash2 } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { menuItemStyles } from '@/components/overlay/overlayStyles'
import { useI18n } from '@/i18n/useI18n'
import { useRecentWorkspaceHistory } from '@/components/titlebar/useRecentWorkspaceHistory'
import type { RecentWorkspaceMenuData } from '@/components/TitlebarWorkspaceMenu'

type RecentWorkspaceMenuSectionProps = {
  data: RecentWorkspaceMenuData
  enabled: boolean
  opening: boolean
  onOpenProject: (path: string) => void
  onRemoved: () => void
}

export const RecentWorkspaceMenuSection = ({
  data,
  enabled,
  opening,
  onOpenProject,
  onRemoved,
}: RecentWorkspaceMenuSectionProps) => {
  const { t } = useI18n()
  const history = useRecentWorkspaceHistory(enabled, data.paths)

  return (
    <>
      {history.checking ? (
        <div role="status" className="px-2 py-1 text-xs text-muted-foreground">
          {t('workspace.checkingHistory')}
        </div>
      ) : null}
      {history.watchFailed ? (
        <div role="status" className="px-2 py-1 text-xs text-muted-foreground">
          {t('workspace.historyWatchFailed')}
        </div>
      ) : null}
      {history.loadFailed ? (
        <DropdownMenuItem
          className={menuItemStyles()}
          onSelect={(event) => {
            event.preventDefault()
            history.retry()
          }}
        >
          <RotateCw aria-hidden="true" />
          {t('workspace.historyCheckFailed')}
        </DropdownMenuItem>
      ) : null}
      {history.removalFailed ? (
        <div role="alert" className="px-2 py-1 text-xs text-destructive">
          {t('workspace.historyRemoveFailed')}
        </div>
      ) : null}
      {history.entries.length ? (
        history.entries.map(({ path, status }) => {
          const label = workspaceName(path)
          const current = data.rootKind !== 'internal' && path === data.rootPath
          return (
            <div key={path} className="flex min-w-0 items-stretch gap-0.5">
              <DropdownMenuItem
                aria-current={current ? 'page' : undefined}
                aria-label={data.openLabel.replace('{name}', label)}
                className={menuItemStyles({ className: 'min-w-0 flex-1 py-2' })}
                disabled={
                  opening || history.checking || history.loadFailed || status !== 'available'
                }
                onSelect={() => onOpenProject(path)}
              >
                <FolderOpen aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{label}</span>
                  <span className="block truncate text-[10px] text-muted-foreground" title={path}>
                    {path}
                  </span>
                  {!history.checking && !history.loadFailed && status !== 'available' ? (
                    <span className="block text-[10px]">
                      {t(
                        status === 'missing'
                          ? 'workspace.historyMissing'
                          : 'workspace.historyUnavailable',
                      )}
                    </span>
                  ) : null}
                </span>
                {current ? (
                  <span className="flex shrink-0 items-center gap-1 text-[10px] text-primary">
                    <Check aria-hidden="true" className="size-3" />
                    {data.currentLabel}
                  </span>
                ) : null}
              </DropdownMenuItem>
              {history.supported ? (
                <DropdownMenuItem
                  aria-label={t('workspace.removeHistory', { name: label })}
                  title={t('workspace.removeHistory', { name: label })}
                  className={menuItemStyles({ className: 'shrink-0 px-2' })}
                  disabled={history.removing}
                  onSelect={(event) => {
                    event.preventDefault()
                    history.remove(path, { onSuccess: onRemoved })
                  }}
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                </DropdownMenuItem>
              ) : null}
            </div>
          )
        })
      ) : (
        <DropdownMenuItem disabled className={menuItemStyles({ className: 'py-2 text-xs' })}>
          {data.emptyLabel}
        </DropdownMenuItem>
      )}
    </>
  )
}

const workspaceName = (path: string) =>
  path
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/)
    .filter(Boolean)
    .at(-1) ?? path
