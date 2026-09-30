import { ArrowUpRight, Clock3, FolderClock, FolderOpen, LibraryBig } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import AppEmptyState from '@/components/AppEmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useI18n } from '@/i18n/useI18n'
import { cn } from '@/lib/utils'
import { useLayoutContext } from '@/pages/useLayoutContext'
import { appApi } from '@/services/appApi'

const pathName = (path: string) => {
  const normalized = path.replace(/[\\/]+$/, '')
  const parts = normalized.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

const uniquePaths = (paths: string[]) =>
  paths.filter((path, index) => path && paths.indexOf(path) === index)

const WorkspaceHistoryPage = () => {
  const { t } = useI18n()
  const {
    onOpenProject,
    onOpenProjectInCurrentWindow,
    onUseInternalRoot,
    recentProjects,
    rootKind,
    rootPath,
  } = useLayoutContext(
    useShallow((state) => ({
      onOpenProject: state.onOpenProject,
      onOpenProjectInCurrentWindow: state.onOpenProjectInCurrentWindow,
      onUseInternalRoot: state.onUseInternalRoot,
      recentProjects: state.recentProjects,
      rootKind: state.rootKind,
      rootPath: state.rootPath,
    })),
  )
  const currentExternalPath = rootKind === 'internal' ? null : rootPath || null
  const visibleRecentProjects = uniquePaths(recentProjects)
  const openWorkspacePicker = () => {
    void appApi.menuDispatch('file.open_project')
  }

  return (
    <div className="workspace-history h-full overflow-hidden bg-background text-foreground">
      <ScrollArea className="h-full" smoothWheel>
        <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
          <header className="workspace-history-hero flex flex-col gap-5 rounded-2xl border border-border/70 p-5 shadow-sm md:flex-row md:items-center md:justify-between md:p-7">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
                <FolderClock aria-hidden="true" className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  {t('history.eyebrow')}
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
                  {t('history.title')}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {t('history.description')}
                </p>
              </div>
            </div>
            <Button type="button" className="shrink-0 rounded-lg" onClick={openWorkspacePicker}>
              <FolderOpen data-icon="inline-start" />
              {t('history.openWorkspace')}
            </Button>
          </header>

          <section aria-labelledby="history-library-title">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2 id="history-library-title" className="text-sm font-semibold">
                  {t('history.libraryTitle')}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('history.libraryDescription')}
                </p>
              </div>
            </div>
            <WorkspaceButton
              current={rootKind === 'internal'}
              description={t('history.localLibraryDescription')}
              icon={<LibraryBig aria-hidden="true" className="size-5" />}
              label={t('history.localLibrary')}
              onClick={onUseInternalRoot}
              openLabel={t('history.openLocalLibrary')}
              currentLabel={t('history.current')}
            />
          </section>

          <section aria-labelledby="history-recent-title">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2 id="history-recent-title" className="text-sm font-semibold">
                  {t('history.recentTitle')}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('history.recentDescription')}
                </p>
              </div>
              {visibleRecentProjects.length > 0 ? (
                <Badge variant="secondary" className="h-6 rounded-md px-2 text-[10px]">
                  {t('history.workspaceCount', {
                    count: String(visibleRecentProjects.length),
                  })}
                </Badge>
              ) : null}
            </div>

            {visibleRecentProjects.length > 0 ? (
              <div className="grid gap-2 md:grid-cols-2">
                {visibleRecentProjects.map((path) => {
                  const name = pathName(path)
                  return (
                    <WorkspaceButton
                      key={path}
                      current={path === currentExternalPath}
                      description={path}
                      icon={<FolderOpen aria-hidden="true" className="size-5" />}
                      label={name}
                      onClick={() => onOpenProject(path)}
                      openLabel={t('workspace.openRecentInNewWindow', { name })}
                      currentLabel={t('history.current')}
                      secondaryAction={
                        path === currentExternalPath
                          ? undefined
                          : {
                              label: t('history.openInCurrentWindow'),
                              accessibleLabel: t('history.openInCurrentWindowItem', { name }),
                              onClick: () => onOpenProjectInCurrentWindow(path),
                            }
                      }
                    />
                  )
                })}
              </div>
            ) : (
              <AppEmptyState
                action={
                  <Button type="button" variant="outline" onClick={openWorkspacePicker}>
                    <FolderOpen data-icon="inline-start" />
                    {t('history.openWorkspace')}
                  </Button>
                }
                className="min-h-56 bg-card/35"
                description={t('history.emptyDescription')}
                icon={<Clock3 aria-hidden="true" />}
                title={t('history.emptyTitle')}
              />
            )}
          </section>
        </main>
      </ScrollArea>
    </div>
  )
}

type WorkspaceButtonProps = {
  current: boolean
  currentLabel: string
  description: string
  icon: React.ReactNode
  label: string
  onClick: () => void
  openLabel: string
  secondaryAction?: {
    accessibleLabel: string
    label: string
    onClick: () => void
  }
}

const WorkspaceButton = ({
  current,
  currentLabel,
  description,
  icon,
  label,
  onClick,
  openLabel,
  secondaryAction,
}: WorkspaceButtonProps) => (
  <div
    className={cn(
      'group flex min-h-20 w-full items-center rounded-xl border bg-card/65 shadow-xs transition-[border-color,background-color,box-shadow,transform]',
      'hover:-translate-y-px hover:border-primary/25 hover:bg-accent/65 hover:shadow-sm active:translate-y-0',
      'focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/35',
      current && 'border-primary/30 bg-primary/6',
    )}
  >
    <button
      type="button"
      aria-current={current ? 'page' : undefined}
      aria-label={openLabel}
      className="flex min-h-20 min-w-0 flex-1 items-center gap-3 rounded-xl px-4 py-3 text-left outline-none"
      onClick={onClick}
    >
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background/80 text-muted-foreground',
          current && 'border-primary/20 bg-primary/10 text-primary',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{label}</span>
          {current ? (
            <Badge variant="secondary" className="h-5 shrink-0 rounded px-1.5 text-[10px]">
              {currentLabel}
            </Badge>
          ) : null}
        </span>
        <span className="mt-1 block truncate text-xs text-muted-foreground">{description}</span>
      </span>
      <ArrowUpRight
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground/60 transition-[color,transform] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground"
      />
    </button>
    {secondaryAction ? (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={secondaryAction.accessibleLabel}
        className="mr-3 shrink-0 rounded-lg text-xs"
        onClick={secondaryAction.onClick}
      >
        {secondaryAction.label}
      </Button>
    ) : null}
  </div>
)

export default WorkspaceHistoryPage
