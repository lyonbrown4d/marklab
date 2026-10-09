import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps, PropsWithChildren } from 'react'
import StatusCenter from '@/components/StatusCenter'
import type { SaveState } from '@/app/useEditorBuffer'
import { exportApi } from '@/services/exportApi'
import { fsApi } from '@/services/fsApi'

const statusCenterMock = vi.hoisted(() => ({
  desktopRuntime: false,
  events: {
    exportTasks: {},
    terminalEvents: [],
  },
  backgroundTasks: [] as Array<{
    id: string
    label: string
    status: 'idle' | 'running' | 'error'
    message?: string | null
  }>,
}))

vi.mock('@/services/fsApi', () => ({
  fsApi: {
    flushBuffers: vi.fn(),
    getBackgroundTasks: vi.fn(() => Promise.resolve(statusCenterMock.backgroundTasks)),
    getBufferStatus: vi.fn(() => Promise.resolve(null)),
    rebuildSearchIndex: vi.fn(),
  },
}))

vi.mock('@/services/exportApi', () => ({
  exportApi: {
    cancelExport: vi.fn(),
    openExportedFile: vi.fn(),
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
        'statusCenter.backgroundLoadFailed': 'Could not load background tasks',
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

const renderStatusCenter = (
  saveStates: Record<string, SaveState> = {},
  overrides: Partial<ComponentProps<typeof StatusCenter>> = {},
) =>
  render(
    <StatusCenter
      activePath="README.md"
      dirtyPaths={{}}
      saveStates={saveStates}
      terminalOpen={false}
      workspaceKey="external:C:/notes"
      visible
      {...overrides}
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
    statusCenterMock.backgroundTasks = []
    vi.mocked(exportApi.cancelExport).mockReset()
    vi.mocked(fsApi.getBackgroundTasks)
      .mockReset()
      .mockImplementation(() => Promise.resolve(statusCenterMock.backgroundTasks))
    vi.mocked(fsApi.getBufferStatus).mockReset().mockResolvedValue(null)
    vi.mocked(fsApi.rebuildSearchIndex).mockReset().mockResolvedValue(undefined)
  })

  it('labels the trigger with the current status summary', () => {
    renderStatusCenter({ 'README.md': { status: 'error', message: 'Disk full' } })

    const trigger = screen.getByRole('button', { name: 'Status Center - 1 issue' })

    expect(trigger).toHaveAttribute('title', 'Status Center - 1 issue')
    expect(trigger.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('reports its active and error summary to the hosting chrome', async () => {
    const onSummaryChange = vi.fn()

    renderStatusCenter(
      {
        'README.md': { status: 'error', message: 'Disk full' },
        'Draft.md': { status: 'saving' },
      },
      { onSummaryChange },
    )

    await waitFor(() =>
      expect(onSummaryChange).toHaveBeenLastCalledWith({ activeCount: 1, issueCount: 1 }),
    )
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

  it('shows background query failures and retries instead of reporting an empty queue', async () => {
    statusCenterMock.desktopRuntime = true
    vi.mocked(fsApi.getBackgroundTasks).mockRejectedValueOnce(new Error('IPC unavailable'))
    renderStatusCenter()

    const trigger = await screen.findByRole('button', { name: 'Status Center - 1 issue' })
    fireEvent.click(trigger)

    expect(screen.getAllByText('Could not load background tasks')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'statusCenter.showDetails' }))
    expect(screen.getByText('IPC unavailable')).toBeVisible()
    expect(screen.queryByText('No background tasks')).not.toBeInTheDocument()
  })

  it('uses workspace identity in status query caches', async () => {
    statusCenterMock.desktopRuntime = true
    const wrapper = createWrapper()
    const view = render(
      <StatusCenter
        activePath="README.md"
        dirtyPaths={{}}
        saveStates={{}}
        terminalOpen={false}
        workspaceKey="external:C:/first"
      />,
      { wrapper },
    )
    await waitFor(() => expect(fsApi.getBackgroundTasks).toHaveBeenCalledTimes(1))

    view.rerender(
      <StatusCenter
        activePath="README.md"
        dirtyPaths={{}}
        saveStates={{}}
        terminalOpen={false}
        workspaceKey="external:D:/second"
      />,
    )

    await waitFor(() => expect(fsApi.getBackgroundTasks).toHaveBeenCalledTimes(2))
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

  it('lets users cancel an active export from the status bar task list', () => {
    statusCenterMock.desktopRuntime = true
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

    fireEvent.click(screen.getByRole('button', { name: 'Status Center - 1 active' }))
    fireEvent.click(screen.getByRole('button', { name: 'statusCenter.cancelTask' }))

    expect(exportApi.cancelExport).toHaveBeenCalledExactlyOnceWith('running')
  })

  it('shows error details and retries supported background tasks', async () => {
    statusCenterMock.desktopRuntime = true
    statusCenterMock.backgroundTasks = [
      {
        id: 'search-index',
        label: 'Workspace index',
        status: 'error',
        message: 'Index database is locked',
      },
    ]
    renderStatusCenter()

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Status Center - 1 issue' })).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Status Center - 1 issue' }))
    fireEvent.click(screen.getByRole('button', { name: 'statusCenter.showDetails' }))
    expect(screen.getByText('Index database is locked')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'statusCenter.retryTask' }))
    expect(fsApi.rebuildSearchIndex).toHaveBeenCalledOnce()
  })
})
