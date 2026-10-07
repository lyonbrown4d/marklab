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
    vi.mocked(invoke).mockResolvedValue(undefined)

    await exportApi.cancelExport('export-pdf-1')

    expect(invoke).toHaveBeenCalledWith('export_cancel', { taskId: 'export-pdf-1' })
  })
})
