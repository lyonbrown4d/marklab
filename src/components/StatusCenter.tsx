import { memo, useId, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, Clock, FileText, Loader2, Terminal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Section, EmptyState, StatusRow } from '@/components/status-center/StatusCenterRows'
import {
  basename,
  formatExportLabel,
  formatTime,
  getSaveToneClass,
  getTaskToneClass,
} from '@/components/status-center/statusCenterModel'
import { useStatusCenterEvents } from '@/components/status-center/useStatusCenterEvents'
import { useI18n } from '@/i18n/useI18n'
import { fsApi } from '@/services/fsApi'
import { isDesktopRuntime } from '@/runtime/environment'
import type { SaveState } from '@/app/useEditorBuffer'

type StatusCenterProps = {
  activePath: string | null
  dirtyPaths: Record<string, true>
  saveStates: Record<string, SaveState>
  terminalOpen: boolean
}

const StatusCenter = ({ activePath, dirtyPaths, saveStates, terminalOpen }: StatusCenterProps) => {
  const { t } = useI18n()
  const titleId = useId()
  const statusCenterTitle = t('statusCenter.title')
  const desktopRuntime = isDesktopRuntime()
  const [open, setOpen] = useState(false)
  const { exportTasks, terminalEvents } = useStatusCenterEvents(desktopRuntime)

  const backgroundTasksQuery = useQuery({
    queryKey: ['status-center', 'background-tasks'],
    queryFn: () => fsApi.getBackgroundTasks(),
    enabled: desktopRuntime,
    staleTime: 1_500,
    refetchInterval: open ? 2_000 : 8_000,
  })

  const activeBufferQuery = useQuery({
    queryKey: ['status-center', 'buffer-status', activePath],
    queryFn: () => fsApi.getBufferStatus(activePath ?? ''),
    enabled: desktopRuntime && open && Boolean(activePath),
    staleTime: 1_000,
    refetchInterval: open ? 2_000 : false,
  })

  const backgroundTasks = backgroundTasksQuery.data ?? []
  const saveEntries = useMemo(() => Object.entries(saveStates), [saveStates])
  const dirtyCount = Object.keys(dirtyPaths).length
  const savingCount = saveEntries.filter(([, state]) => state.status === 'saving').length
  const saveErrorCount = saveEntries.filter(([, state]) => state.status === 'error').length
  const backgroundRunningCount = backgroundTasks.filter((task) => task.status === 'running').length
  const backgroundErrorCount = backgroundTasks.filter((task) => task.status === 'error').length
  const recentExportTasks = useMemo(
    () =>
      Object.values(exportTasks)
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, 5),
    [exportTasks],
  )
  const exportRunningCount = recentExportTasks.filter((task) => task.status === 'started').length
  const exportErrorCount = recentExportTasks.filter((task) => task.status === 'failed').length
  const activeCount = backgroundRunningCount + savingCount + exportRunningCount
  const issueCount = backgroundErrorCount + saveErrorCount + exportErrorCount
  const buttonLabel =
    issueCount > 0
      ? t('statusCenter.issueCount', { count: issueCount })
      : activeCount > 0
        ? t('statusCenter.activeCount', { count: activeCount })
        : t('statusCenter.ready')
  const triggerLabel = `${statusCenterTitle} - ${buttonLabel}`
  const activeSaveState = activePath ? saveStates[activePath] : undefined
  const activeBuffer = activeBufferQuery.data

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={open || issueCount > 0 ? 'secondary' : 'ghost'}
          size="sm"
          className="h-6 gap-1.5 rounded px-2 text-[11px] font-normal text-muted-foreground"
          aria-label={triggerLabel}
          title={triggerLabel}
        >
          {issueCount > 0 ? (
            <AlertTriangle aria-hidden="true" className="size-3.5 text-destructive" />
          ) : activeCount > 0 ? (
            <Loader2 aria-hidden="true" className="size-3.5 animate-spin text-muted-foreground" />
          ) : (
            <Activity aria-hidden="true" className="size-3.5" />
          )}
          <span className="hidden sm:inline">{buttonLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        className="w-[380px] p-0"
        aria-labelledby={titleId}
        role="dialog"
      >
        <div className="border-b border-border/80 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground" id={titleId}>
                {statusCenterTitle}
              </h2>
              <p className="text-xs text-muted-foreground">
                {desktopRuntime
                  ? t('statusCenter.summary', { active: activeCount, issues: issueCount })
                  : t('statusCenter.unavailable')}
              </p>
            </div>
            <Badge
              variant={issueCount > 0 ? 'outline' : 'secondary'}
              className={issueCount > 0 ? 'border-destructive/30 text-destructive' : undefined}
            >
              {buttonLabel}
            </Badge>
          </div>
        </div>
        <ScrollArea className="max-h-[520px]" viewportClassName="p-4">
          <div className="flex flex-col gap-4">
            <Section title={t('statusCenter.backgroundTasks')}>
              {backgroundTasksQuery.isLoading ? (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-11/12" />
                </div>
              ) : backgroundTasks.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {backgroundTasks.map((task) => (
                    <StatusRow
                      key={task.id}
                      dotClassName={getTaskToneClass(task.status)}
                      meta={task.message ?? task.status}
                    >
                      {task.label}
                    </StatusRow>
                  ))}
                </div>
              ) : (
                <EmptyState
                  label={
                    desktopRuntime
                      ? t('statusCenter.noBackgroundTasks')
                      : t('statusCenter.unavailable')
                  }
                />
              )}
            </Section>

            <Section title={t('statusCenter.activeBuffer')}>
              {activePath ? (
                <StatusRow
                  dotClassName={getSaveToneClass(activeSaveState?.status ?? 'saved')}
                  meta={
                    activeBufferQuery.isLoading
                      ? t('statusCenter.checkingBuffer')
                      : activeBuffer
                        ? t('statusCenter.bufferRevision', {
                            revision: activeBuffer.revision,
                            state: activeBuffer.dirty
                              ? t('statusCenter.dirty')
                              : t('statusCenter.synced'),
                          })
                        : (activeSaveState?.message ??
                          activeSaveState?.status ??
                          t('statusCenter.saved'))
                  }
                >
                  {basename(activePath)}
                </StatusRow>
              ) : (
                <EmptyState label={t('statusCenter.noActiveFile')} />
              )}
            </Section>

            <Section title={t('statusCenter.saveQueue')}>
              {dirtyCount > 0 || savingCount > 0 || saveErrorCount > 0 ? (
                <div className="flex flex-col gap-2">
                  {saveEntries
                    .filter(([, state]) => state.status !== 'saved')
                    .slice(0, 8)
                    .map(([path, state]) => (
                      <StatusRow
                        key={path}
                        dotClassName={getSaveToneClass(state.status)}
                        meta={state.message ?? state.status}
                      >
                        {basename(path)}
                      </StatusRow>
                    ))}
                  {dirtyCount > saveEntries.length && (
                    <StatusRow
                      dotClassName="bg-primary"
                      meta={t('statusCenter.dirtyFiles', { count: dirtyCount })}
                    >
                      {t('statusCenter.unsavedFiles')}
                    </StatusRow>
                  )}
                </div>
              ) : (
                <EmptyState label={t('statusCenter.noSaveActivity')} />
              )}
            </Section>

            <Section title={t('statusCenter.exportAndTerminal')}>
              <div className="flex flex-col gap-2">
                <StatusRow
                  dotClassName={terminalOpen ? 'bg-primary' : 'bg-muted-foreground/45'}
                  meta={terminalEvents[0] ? formatTime(terminalEvents[0].updatedAt) : undefined}
                >
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <Terminal aria-hidden="true" className="size-3.5 shrink-0" />
                    <span className="truncate">
                      {terminalEvents[0]?.message ??
                        (terminalOpen
                          ? t('statusCenter.terminalOpen')
                          : t('statusCenter.terminalClosed'))}
                    </span>
                  </span>
                </StatusRow>
                {recentExportTasks.length > 0 ? (
                  recentExportTasks.map((task) => (
                    <StatusRow
                      key={task.id}
                      dotClassName={
                        task.status === 'failed'
                          ? 'bg-destructive'
                          : task.status === 'started'
                            ? 'bg-primary'
                            : 'bg-muted-foreground'
                      }
                      meta={
                        task.message ??
                        `${basename(task.output_path)} · ${formatTime(task.updatedAt)}`
                      }
                    >
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        {task.status === 'started' ? (
                          <Clock aria-hidden="true" className="size-3.5 shrink-0" />
                        ) : (
                          <FileText aria-hidden="true" className="size-3.5 shrink-0" />
                        )}
                        <span className="truncate">
                          {formatExportLabel(task, (key, options) => t(key, options))}
                        </span>
                      </span>
                    </StatusRow>
                  ))
                ) : (
                  <EmptyState label={t('statusCenter.noEvents')} />
                )}
              </div>
            </Section>
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

export default memo(StatusCenter)
