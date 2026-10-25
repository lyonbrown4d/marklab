import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveDialog } from '@/runtime/dialog'
import { invoke } from '@/runtime/ipc'
import { exportApi } from '@/services/exportApi'

vi.mock('@/runtime/dialog', () => ({ saveDialog: vi.fn() }))
vi.mock('@/runtime/ipc', () => ({ invoke: vi.fn() }))

describe('exportApi', () => {
  beforeEach(() => {
    vi.mocked(saveDialog).mockReset()
    vi.mocked(invoke).mockReset()
  })

  it('resolves document resources from the source document directory', async () => {
    vi.mocked(saveDialog).mockResolvedValue('D:/exports/guide.pdf')
    vi.mocked(invoke).mockResolvedValue('export-pdf-1')

    await expect(
      exportApi.exportDocument('pdf', {
        rootPath: 'D:/notes',
        activePath: 'docs/guide.md',
      }),
    ).resolves.toBe('export-pdf-1')

    expect(invoke).toHaveBeenCalledWith('export_markdown', {
      format: 'pdf',
      outputPath: 'D:/exports/guide.pdf',
      sourceDocumentPath: 'docs/guide.md',
    })
  })

  it('sends an explicit cancellation command for an active task', async () => {
    vi.mocked(invoke).mockResolvedValue(null)

    await exportApi.cancelExport('export-pdf-1')

    expect(invoke).toHaveBeenCalledWith('export_cancel', { taskId: 'export-pdf-1' })
  })

  it.each(['epub', 'txt'] as const)('queues %s with the correct save filter', async (format) => {
    vi.mocked(saveDialog).mockResolvedValue(`/exports/guide.${format}`)
    vi.mocked(invoke).mockResolvedValue(`export-${format}-1`)
    await exportApi.exportDocument(format, { rootPath: '/notes', activePath: 'guide.md' })
    expect(saveDialog).toHaveBeenCalledWith({
      defaultPath: `/notes/guide.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    })
    expect(invoke).toHaveBeenCalledWith('export_markdown', {
      format,
      outputPath: `/exports/guide.${format}`,
      sourceDocumentPath: 'guide.md',
    })
  })

  it('does not enqueue an export after cancelling the save dialog', async () => {
    vi.mocked(saveDialog).mockResolvedValue(null)
    await expect(
      exportApi.exportDocument('epub', { rootPath: '/notes', activePath: 'guide.md' }),
    ).resolves.toBeUndefined()
    expect(invoke).not.toHaveBeenCalled()
  })
})
