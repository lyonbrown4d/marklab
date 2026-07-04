import type { SaveState } from '@/app/useEditorBuffer'
import type { BackgroundTaskStatus } from '@/services/fsApi'
import type { TerminalExitEvent, TerminalOutputEvent } from '@/services/terminalApi'

export type ExportTaskStatus = 'started' | 'finished' | 'failed'

export type ExportTaskPayload = {
  id: string
  format: string
  output_path: string
  status: ExportTaskStatus
  progress?: number | null
  message?: string | null
}

export type ExportTaskEntry = ExportTaskPayload & {
  updatedAt: number
}

export type TerminalEventEntry = {
  id: string
  status: 'running' | 'exited'
  message: string
  updatedAt: number
}

type Translate = (key: string, options?: Record<string, unknown>) => string

export const basename = (path: string) => {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

export const formatTime = (timestamp: number) => {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export const formatExportLabel = (task: ExportTaskEntry, t?: Translate) => {
  const format = task.format === 'docx' ? 'Word' : task.format.toUpperCase()
  if (t) {
    if (task.status === 'started') return t('statusCenter.exportStarted', { format })
    if (task.status === 'finished') return t('statusCenter.exportFinished', { format })
    return t('statusCenter.exportFailed', { format })
  }

  if (task.status === 'started') return `Exporting ${format}`
  if (task.status === 'finished') return `Exported ${format}`
  return `Failed to export ${format}`
}

export const getTaskToneClass = (status: BackgroundTaskStatus['status']) => {
  if (status === 'running') return 'bg-status-info'
  if (status === 'error') return 'bg-destructive'
  return 'bg-muted-foreground/45'
}

export const getSaveToneClass = (status: SaveState['status']) => {
  if (status === 'saving') return 'bg-status-info'
  if (status === 'error') return 'bg-destructive'
  if (status === 'unsaved') return 'bg-status-warning'
  return 'bg-status-success'
}

export const summarizeTerminalOutput = (event: TerminalOutputEvent, t?: Translate) => {
  const text = event.data.replace(/\s+/g, ' ').trim()
  if (t) {
    return text
      ? t('statusCenter.terminalOutput', { text: text.slice(0, 80) })
      : t('statusCenter.terminalOutputReceived')
  }
  return text ? `Terminal output: ${text.slice(0, 80)}` : 'Terminal output received'
}

export const summarizeTerminalExit = (event: TerminalExitEvent, t?: Translate) => {
  if (t) {
    if (event.exit_code != null) {
      return t('statusCenter.terminalExitedCode', { code: event.exit_code })
    }
    if (event.signal) return t('statusCenter.terminalExitedSignal', { signal: event.signal })
    return t('statusCenter.terminalExited')
  }

  if (event.exit_code != null) return `Terminal exited with code ${event.exit_code}`
  if (event.signal) return `Terminal exited by ${event.signal}`
  return 'Terminal exited'
}
