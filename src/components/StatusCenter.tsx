import { memo, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Terminal,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Section, EmptyState, StatusRow } from '@/components/status-center/StatusCenterRows'
import {
  TEXT,
  basename,
  formatExportLabel,
  formatTime,
  getSaveToneClass,
  getTaskToneClass,
} from '@/components/status-center/statusCenterModel'
import { useStatusCenterEvents } from '@/components/status-center/useStatusCenterEvents'
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
      ? `${issueCount} issue${issueCount === 1 ? '' : 's'}`
      : activeCount > 0
        ? `${activeCount} active`
        : TEXT.ready
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
          aria-label={TEXT.statusCenter}
          title={TEXT.statusCenter}
        >
          {issueCount > 0 ? (
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
          ) : activeCount > 0 ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-600" />
          ) : (
            <Activity className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">{buttonLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-[380px] p-0">
        <div className="border-b border-border/80 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{TEXT.statusCenter}</h2>
              <p className="text-xs text-muted-foreground">
                {desktopRuntime ? `${activeCount} active · ${issueCount} issues` : TEXT.unavailable}
              </p>
            </div>
            {issueCount > 0 ? (
              <AlertTriangle className="h-4 w-4 text-destructive" />
            ) : activeCount > 0 ? (
              <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            )}
          </div>
        </div>
        <div className="max-h-[520px] space-y-4 overflow-y-auto p-4">
          <Section title={TEXT.backgroundTasks}>
            {backgroundTasksQuery.isLoading ? (
              <StatusRow dotClassName="bg-sky-500" meta="Polling workspace services">
                Loading background tasks
              </StatusRow>
            ) : backgroundTasks.length > 0 ? (
              <div className="space-y-2">
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
              <EmptyState label={desktopRuntime ? TEXT.noBackgroundTasks : TEXT.unavailable} />
            )}
          </Section>

          <Section title={TEXT.activeBuffer}>
            {activePath ? (
              <StatusRow
                dotClassName={getSaveToneClass(activeSaveState?.status ?? 'saved')}
                meta={
                  activeBufferQuery.isLoading
                    ? TEXT.checkingBuffer
                    : activeBuffer
                      ? `revision ${activeBuffer.revision} · ${activeBuffer.dirty ? TEXT.dirty : TEXT.synced}`
                      : (activeSaveState?.message ?? activeSaveState?.status ?? TEXT.saved)
                }
              >
                {basename(activePath)}
              </StatusRow>
            ) : (
              <EmptyState label={TEXT.noActiveFile} />
            )}
          </Section>

          <Section title={TEXT.saveQueue}>
            {dirtyCount > 0 || savingCount > 0 || saveErrorCount > 0 ? (
              <div className="space-y-2">
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
                  <StatusRow dotClassName="bg-amber-500" meta={`${dirtyCount} dirty files`}>
                    Unsaved files
                  </StatusRow>
                )}
              </div>
            ) : (
              <EmptyState label={TEXT.noSaveActivity} />
            )}
          </Section>

          <Section title={TEXT.exportAndTerminal}>
            <div className="space-y-2">
              <StatusRow
                dotClassName={terminalOpen ? 'bg-sky-500' : 'bg-muted-foreground/45'}
                meta={terminalEvents[0] ? formatTime(terminalEvents[0].updatedAt) : undefined}
              >
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <Terminal className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {terminalEvents[0]?.message ??
                      (terminalOpen ? TEXT.terminalOpen : TEXT.terminalClosed)}
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
                          ? 'bg-sky-500'
                          : 'bg-emerald-500'
                    }
                    meta={
                      task.message ??
                      `${basename(task.output_path)} · ${formatTime(task.updatedAt)}`
                    }
                  >
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      {task.status === 'started' ? (
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span className="truncate">{formatExportLabel(task)}</span>
                    </span>
                  </StatusRow>
                ))
              ) : (
                <EmptyState label={TEXT.noEvents} />
              )}
            </div>
          </Section>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default memo(StatusCenter)
