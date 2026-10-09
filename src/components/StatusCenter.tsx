import { memo, useEffect, useId, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PopoverContent } from '@/components/ui/popover'
import { ScrollArea } from '@/components/AppScrollArea'
import { Skeleton } from '@/components/ui/skeleton'
import { Section, EmptyState, StatusRow } from '@/components/status-center/StatusCenterRows'
import {
  basename,
  getSaveToneClass,
  getTaskToneClass,
} from '@/components/status-center/statusCenterModel'
import { useStatusCenterEvents } from '@/components/status-center/useStatusCenterEvents'
import { useI18n } from '@/i18n/useI18n'
import { fsApi } from '@/services/fsApi'
import { isDesktopRuntime } from '@/runtime/environment'
import type { SaveState } from '@/app/useEditorBuffer'
import { TaskStatusRow } from '@/components/status-center/TaskStatusRow'
import { StatusCenterHeader } from '@/components/status-center/StatusCenterHeader'
import { StatusCenterExportSection } from '@/components/status-center/StatusCenterExportSection'
import { StatusCenterPopoverRoot } from '@/components/status-center/StatusCenterPopoverRoot'
import { StatusCenterTrigger } from '@/components/status-center/StatusCenterTrigger'
import type { StatusCenterSummary } from '@/components/status-center/statusCenterModel'
import { useStatusCenterSummaryStore } from '@/store/useStatusCenterSummaryStore'

type StatusCenterProps = {
  activePath: string | null
  dirtyPaths: Record<string, true>
  saveStates: Record<string, SaveState>
  terminalOpen: boolean
  workspaceKey: string
  visible?: boolean
  onSummaryChange?: (summary: StatusCenterSummary) => void
  onVisibilityCloseFocus?: () => void
}

const StatusCenter = ({
  activePath,
  dirtyPaths,
  saveStates,
  terminalOpen,
  workspaceKey,
  visible = true,
  onSummaryChange,
  onVisibilityCloseFocus,
}: StatusCenterProps) => {
  const { t } = useI18n()
  const titleId = useId()
  const statusCenterTitle = t('statusCenter.title')
  const desktopRuntime = isDesktopRuntime()
  const setStoredSummary = useStatusCenterSummaryStore((state) => state.setSummary)
  const { eventError, exportTasks, terminalEvents } = useStatusCenterEvents(desktopRuntime)

  const backgroundTasksQuery = useQuery({
    queryKey: ['status-center', workspaceKey, 'background-tasks'],
    queryFn: () => fsApi.getBackgroundTasks(),
    enabled: desktopRuntime,
    staleTime: 1_500,
    refetchInterval: visible ? 2_000 : 8_000,
  })

  const activeBufferQuery = useQuery({
    queryKey: ['status-center', workspaceKey, 'buffer-status', activePath],
    queryFn: () => fsApi.getBufferStatus(activePath ?? ''),
    enabled: desktopRuntime && visible && Boolean(activePath),
    staleTime: 1_000,
    refetchInterval: visible ? 2_000 : false,
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
  const queryErrorCount = Number(backgroundTasksQuery.isError) + Number(activeBufferQuery.isError)
  const issueCount =
    backgroundErrorCount +
    saveErrorCount +
    exportErrorCount +
    queryErrorCount +
    Number(Boolean(eventError))
  useEffect(() => {
    const summary = { activeCount, issueCount }
    setStoredSummary(summary)
    onSummaryChange?.(summary)
  }, [activeCount, issueCount, onSummaryChange, setStoredSummary])
  const buttonLabel =
    issueCount > 0
      ? t('statusCenter.issueCount', { count: issueCount })
      : activeCount > 0
        ? t('statusCenter.activeCount', { count: activeCount })
        : t('statusCenter.ready')
  const triggerLabel = `${statusCenterTitle} - ${buttonLabel}`
  const activeSaveState = activePath ? saveStates[activePath] : undefined
  const activeBuffer = activeBufferQuery.data
  const taskLabels = {
    cancel: t('statusCenter.cancelTask'),
    retry: t('statusCenter.retryTask'),
    showDetails: t('statusCenter.showDetails'),
    open: t('statusCenter.openOutput'),
  }
  const retryBackgroundTask = async (taskId: string) => {
    if (taskId === 'search-index') {
      await fsApi.rebuildSearchIndex()
      await backgroundTasksQuery.refetch()
      return
    }
    if (taskId === 'buffer-flush') {
      await fsApi.flushBuffers()
      await backgroundTasksQuery.refetch()
    }
  }

  return (
    <StatusCenterPopoverRoot
      key={visible ? 'visible' : 'hidden'}
      visible={visible}
      onVisibilityCloseFocus={onVisibilityCloseFocus}
    >
      {(open) => (
        <>
          <StatusCenterTrigger
            activeCount={activeCount}
            buttonLabel={buttonLabel}
            issueCount={issueCount}
            open={open}
            triggerLabel={triggerLabel}
          />
          <PopoverContent
            align="end"
            side="top"
            className="w-[380px] p-0"
            aria-labelledby={titleId}
            role="dialog"
          >
            <StatusCenterHeader
              activeCount={activeCount}
              buttonLabel={buttonLabel}
              issueCount={issueCount}
              summary={
                desktopRuntime
                  ? t('statusCenter.summary', { active: activeCount, issues: issueCount })
                  : t('statusCenter.unavailable')
              }
              title={statusCenterTitle}
              titleId={titleId}
            />
            <ScrollArea className="max-h-[520px]" viewportClassName="p-4">
              <div className="flex flex-col gap-4">
                <Section title={t('statusCenter.backgroundTasks')}>
                  {backgroundTasksQuery.isError ? (
                    <TaskStatusRow
                      details={
                        backgroundTasksQuery.error instanceof Error
                          ? backgroundTasksQuery.error.message
                          : String(backgroundTasksQuery.error)
                      }
                      dotClassName="bg-destructive"
                      labels={taskLabels}
                      meta={t('statusCenter.backgroundLoadFailed')}
                      onRetry={() => backgroundTasksQuery.refetch()}
                    >
                      {t('statusCenter.backgroundLoadFailed')}
                    </TaskStatusRow>
                  ) : backgroundTasksQuery.isLoading ? (
                    <div className="flex flex-col gap-2">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-11/12" />
                    </div>
                  ) : backgroundTasks.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {backgroundTasks.map((task) => (
                        <TaskStatusRow
                          key={task.id}
                          dotClassName={getTaskToneClass(task.status)}
                          details={task.status === 'error' ? task.message : undefined}
                          labels={taskLabels}
                          meta={task.status}
                          onRetry={
                            task.status === 'error' &&
                            (task.id === 'search-index' || task.id === 'buffer-flush')
                              ? () => retryBackgroundTask(task.id)
                              : undefined
                          }
                        >
                          {task.label}
                        </TaskStatusRow>
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
                  {activePath && activeBufferQuery.isError ? (
                    <TaskStatusRow
                      details={
                        activeBufferQuery.error instanceof Error
                          ? activeBufferQuery.error.message
                          : String(activeBufferQuery.error)
                      }
                      dotClassName="bg-destructive"
                      labels={taskLabels}
                      meta={basename(activePath)}
                      onRetry={() => activeBufferQuery.refetch()}
                    >
                      {t('statusCenter.bufferLoadFailed')}
                    </TaskStatusRow>
                  ) : activePath ? (
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

                <StatusCenterExportSection
                  eventError={eventError}
                  labels={taskLabels}
                  recentExportTasks={recentExportTasks}
                  terminalEvents={terminalEvents}
                  terminalOpen={terminalOpen}
                  text={{
                    closed: t('statusCenter.terminalClosed'),
                    noEvents: t('statusCenter.noEvents'),
                    open: t('statusCenter.terminalOpen'),
                    section: t('statusCenter.exportAndTerminal'),
                    unavailable: t('statusCenter.activityUnavailable'),
                  }}
                  translate={(key, options) => t(key, options)}
                />
              </div>
            </ScrollArea>
          </PopoverContent>
        </>
      )}
    </StatusCenterPopoverRoot>
  )
}

export default memo(StatusCenter)
