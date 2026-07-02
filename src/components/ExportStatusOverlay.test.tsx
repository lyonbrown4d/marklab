import { render, waitFor } from '@testing-library/react'
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
    openExportedFile: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
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
    status: 'started' | 'finished' | 'failed'
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
const openExportedFileMock = vi.mocked(exportApi.openExportedFile)

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
  openExportedFileMock.mockReset()
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
      },
    })

    expect(toastLoadingMock).toHaveBeenCalledWith(
      'export.running:Word',
      expect.objectContaining({
        description: 'Quarterly Report.docx',
        id: 'export-1',
        icon: expect.anything(),
      }),
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
    const action = options?.action as ToastAction | undefined
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
        description: 'Permission denied',
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
