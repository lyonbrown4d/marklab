import { render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ExportStatusOverlay from '@/components/ExportStatusOverlay'
import { listen } from '@/runtime/events'
import { exportApi } from '@/services/exportApi'

const mocks = vi.hoisted(() => ({
  isDesktopRuntime: vi.fn(() => true),
}))

vi.mock('@/runtime/environment', () => ({
  isDesktopRuntime: mocks.isDesktopRuntime,
}))

vi.mock('@/runtime/events', () => ({
  listen: vi.fn(),
}))

vi.mock('@/services/exportApi', () => ({
  exportApi: {
    cancelExport: vi.fn(),
    openExportedFile: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      if (values?.format) return `${key}:${values.format}`
      return key
    },
  }),
}))

type ExportTaskEvent = {
  payload: {
    id: string
    format: string
    output_path: string
    status: 'started' | 'finished' | 'failed' | 'cancelled'
    progress?: number | null
    message?: string | null
  }
}

type ExportTaskListener = (event: ExportTaskEvent) => void

type ToastAction = {
  onClick?: () => void
}

const listenMock = vi.mocked(listen)
const toastLoadingMock = vi.mocked(toast.loading)
const toastSuccessMock = vi.mocked(toast.success)
const toastErrorMock = vi.mocked(toast.error)
const toastInfoMock = vi.mocked(toast.info)
const openExportedFileMock = vi.mocked(exportApi.openExportedFile)
const cancelExportMock = vi.mocked(exportApi.cancelExport)

const renderOverlayWithListener = async () => {
  const registered: { listener: ExportTaskListener | null } = { listener: null }
  const unlisten = vi.fn()

  listenMock.mockImplementation(async (_channel, nextListener) => {
    registered.listener = nextListener as ExportTaskListener
    return unlisten
  })

  const view = render(<ExportStatusOverlay />)

  await waitFor(() => {
    expect(listenMock).toHaveBeenCalledWith('export-task', expect.any(Function))
  })

  const listener = registered.listener
  if (!listener) throw new Error('export-task listener was not registered')

  return { ...view, listener, unlisten }
}

beforeEach(() => {
  mocks.isDesktopRuntime.mockReturnValue(true)
  listenMock.mockReset()
  toastLoadingMock.mockReset()
  toastSuccessMock.mockReset()
  toastErrorMock.mockReset()
  toastInfoMock.mockReset()
  openExportedFileMock.mockReset()
  cancelExportMock.mockReset()
})

describe('ExportStatusOverlay', () => {
  it('shows a loading toast when export starts', async () => {
    const { listener } = await renderOverlayWithListener()

    listener({
      payload: {
        id: 'export-1',
        format: 'docx',
        output_path: 'C:/exports/Quarterly Report.docx',
        status: 'started',
        progress: 0.35,
        message: 'Rendering document',
      },
    })

    expect(toastLoadingMock).toHaveBeenCalledWith(
      'export.running:Word',
      expect.objectContaining({ id: 'export-1', icon: expect.anything() }),
    )

    const description = toastLoadingMock.mock.calls[0]?.[1]?.description
    render(<>{description}</>)
    expect(screen.getByText('Rendering document')).toBeInTheDocument()
    expect(screen.getByText('Quarterly Report.docx')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'export.running:Word' })).toHaveAttribute(
      'aria-valuenow',
      '35',
    )

    const options = toastLoadingMock.mock.calls[0]?.[1]
    const action = options?.action as (ToastAction & { label?: string }) | undefined
    expect(action?.label).toBe('export.cancel')
    action?.onClick?.()
    expect(cancelExportMock).toHaveBeenCalledWith('export-1')
  })

  it('replaces the loading toast when an export is cancelled', async () => {
    const { listener } = await renderOverlayWithListener()

    listener({
      payload: {
        id: 'export-4',
        format: 'pdf',
        output_path: '/tmp/report.pdf',
        status: 'cancelled',
      },
    })

    expect(toastInfoMock).toHaveBeenCalledWith(
      'export.cancelled:PDF',
      expect.objectContaining({ id: 'export-4', description: 'report.pdf' }),
    )
  })

  it('shows a success toast with an open-file action when export finishes', async () => {
    const { listener } = await renderOverlayWithListener()

    listener({
      payload: {
        id: 'export-2',
        format: 'pdf',
        output_path: '/tmp/report.pdf',
        status: 'finished',
      },
    })

    expect(toastSuccessMock).toHaveBeenCalledWith(
      'export.finished:PDF',
      expect.objectContaining({
        description: 'report.pdf',
        id: 'export-2',
      }),
    )

    const options = toastSuccessMock.mock.calls[0]?.[1]
    const action = options?.action as (ToastAction & { label?: string }) | undefined
    expect(action?.label).toBe('export.openFile')
    action?.onClick?.()

    expect(openExportedFileMock).toHaveBeenCalledWith('/tmp/report.pdf')
  })

  it('shows a failure toast with the actionable error message', async () => {
    const { listener } = await renderOverlayWithListener()

    listener({
      payload: {
        id: 'export-3',
        format: 'html',
        message: 'Permission denied',
        output_path: '/tmp/report.html',
        status: 'failed',
      },
    })

    expect(toastErrorMock).toHaveBeenCalledWith(
      'export.failed:HTML',
      expect.objectContaining({
        description: 'report.html - Permission denied',
        id: 'export-3',
      }),
    )
  })

  it('does not subscribe outside the desktop runtime', () => {
    mocks.isDesktopRuntime.mockReturnValue(false)

    render(<ExportStatusOverlay />)

    expect(listenMock).not.toHaveBeenCalled()
  })
})
