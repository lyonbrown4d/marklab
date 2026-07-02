import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { PropsWithChildren } from 'react'
import StatusCenter from '@/components/StatusCenter'
import type { SaveState } from '@/app/useEditorBuffer'

vi.mock('@/runtime/environment', () => ({
  isDesktopRuntime: () => false,
}))

vi.mock('@/components/status-center/useStatusCenterEvents', () => ({
  useStatusCenterEvents: () => ({
    exportTasks: {},
    terminalEvents: [],
  }),
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const labels: Record<string, string> = {
        'statusCenter.activeBuffer': 'Active buffer',
        'statusCenter.backgroundTasks': 'Background tasks',
        'statusCenter.exportAndTerminal': 'Export and terminal',
        'statusCenter.issueCount': `${options?.count ?? 0} issue`,
        'statusCenter.noBackgroundTasks': 'No background tasks',
        'statusCenter.ready': 'Ready',
        'statusCenter.saveQueue': 'Save queue',
        'statusCenter.summary': `${options?.active ?? 0} active, ${options?.issues ?? 0} issues`,
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
  it('labels the trigger with the current status summary', () => {
    renderStatusCenter({ 'README.md': { status: 'error', message: 'Disk full' } })

    const trigger = screen.getByRole('button', { name: 'Status Center - 1 issue' })

    expect(trigger).toHaveAttribute('title', 'Status Center - 1 issue')
    expect(trigger.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
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
})
