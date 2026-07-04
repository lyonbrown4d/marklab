import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PropsWithChildren } from 'react'
import StatusCenter from '@/components/StatusCenter'
import type { SaveState } from '@/app/useEditorBuffer'

const statusCenterMock = vi.hoisted(() => ({
  desktopRuntime: false,
  events: {
    exportTasks: {},
    terminalEvents: [],
  },
}))

vi.mock('@/runtime/environment', () => ({
  isDesktopRuntime: () => statusCenterMock.desktopRuntime,
}))

vi.mock('@/components/status-center/useStatusCenterEvents', () => ({
  useStatusCenterEvents: () => statusCenterMock.events,
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const labels: Record<string, string> = {
        'statusCenter.activeBuffer': 'Active buffer',
        'statusCenter.backgroundTasks': 'Background tasks',
        'statusCenter.activeCount': `${options?.count ?? 0} active`,
        'statusCenter.exportAndTerminal': 'Export and terminal',
        'statusCenter.exportFailed': `Failed to export ${options?.format ?? ''}`,
        'statusCenter.exportFinished': `Exported ${options?.format ?? ''}`,
        'statusCenter.exportStarted': `Exporting ${options?.format ?? ''}`,
        'statusCenter.issueCount': `${options?.count ?? 0} issue`,
        'statusCenter.noBackgroundTasks': 'No background tasks',
        'statusCenter.ready': 'Ready',
        'statusCenter.noEvents': 'No recent events',
        'statusCenter.saveQueue': 'Save queue',
        'statusCenter.summary': `${options?.active ?? 0} active, ${options?.issues ?? 0} issues`,
        'statusCenter.terminalClosed': 'Terminal panel closed',
        'statusCenter.terminalOpen': 'Terminal panel open',
        'statusCenter.title': 'Status Center',
        'statusCenter.unavailable': 'Desktop runtime unavailable',
      }

      return labels[key] ?? key
    },
  }),
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

const renderStatusCenter = (saveStates: Record<string, SaveState> = {}) =>
  render(
    <StatusCenter
      activePath="README.md"
      dirtyPaths={{}}
      saveStates={saveStates}
      terminalOpen={false}
    />,
    { wrapper: createWrapper() },
  )

describe('StatusCenter', () => {
  beforeEach(() => {
    statusCenterMock.desktopRuntime = false
    statusCenterMock.events = {
      exportTasks: {},
      terminalEvents: [],
    }
  })

  it('labels the trigger with the current status summary', () => {
    renderStatusCenter({ 'README.md': { status: 'error', message: 'Disk full' } })

    const trigger = screen.getByRole('button', { name: 'Status Center - 1 issue' })

    expect(trigger).toHaveAttribute('title', 'Status Center - 1 issue')
    expect(trigger.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('uses the shared spinner when background activity is running', () => {
    statusCenterMock.events = {
      exportTasks: {
        running: {
          id: 'running',
          format: 'pdf',
          output_path: 'D:/notes/report.pdf',
          status: 'started',
          updatedAt: 103,
        },
      },
      terminalEvents: [],
    }

    renderStatusCenter()

    const trigger = screen.getByRole('button', { name: 'Status Center - 1 active' })
    const spinner = trigger.querySelector('svg[role="presentation"]')

    expect(spinner).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument()
  })

  it('opens a labelled status dialog with named sections', () => {
    renderStatusCenter()

    fireEvent.click(screen.getByRole('button', { name: 'Status Center - Ready' }))

    const dialog = screen.getByRole('dialog', { name: 'Status Center' })

    expect(dialog).toHaveTextContent('Desktop runtime unavailable')
    expect(screen.getByRole('region', { name: 'Background tasks' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Active buffer' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Save queue' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Export and terminal' })).toBeInTheDocument()
  })

  it('shows localized desktop export task labels in the status dialog', () => {
    statusCenterMock.desktopRuntime = true
    statusCenterMock.events = {
      exportTasks: {
        finished: {
          id: 'finished',
          format: 'docx',
          output_path: 'D:/notes/report.docx',
          status: 'finished',
          updatedAt: 101,
        },
        failed: {
          id: 'failed',
          format: 'pdf',
          output_path: 'D:/notes/report.pdf',
          status: 'failed',
          updatedAt: 102,
        },
      },
      terminalEvents: [],
    }

    renderStatusCenter()

    fireEvent.click(screen.getByRole('button', { name: 'Status Center - 1 issue' }))

    expect(screen.getByText('Failed to export PDF')).toBeInTheDocument()
    expect(screen.getByText('Exported Word')).toBeInTheDocument()
  })
})
