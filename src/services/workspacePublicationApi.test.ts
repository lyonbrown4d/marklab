import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveDialog } from '@/runtime/dialog'
import { invoke } from '@/runtime/ipc'
import { workspacePublicationApi } from '@/services/workspacePublicationApi'
import { defaultPublicationOptions } from '@/components/workspace-publication/workspacePublicationModel'

vi.mock('@/runtime/dialog', () => ({ saveDialog: vi.fn() }))
vi.mock('@/runtime/ipc', () => ({ invoke: vi.fn() }))

describe('workspace publication output formats', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(['epub', 'txt'] as const)(
    'saves a %s publication with its own extension',
    async (format) => {
      vi.mocked(saveDialog).mockResolvedValue(`/exports/book.${format}`)
      vi.mocked(invoke).mockResolvedValue(`export-${format}-1`)
      const options = { ...defaultPublicationOptions(), format, title: 'Book' }
      const chapters = [{ path: 'intro.md', title: 'Introduction' }]
      await expect(
        workspacePublicationApi.exportPublication(chapters, options, '/notes'),
      ).resolves.toBe(`export-${format}-1`)
      expect(saveDialog).toHaveBeenCalledWith({
        defaultPath: `/notes/Book.${format}`,
        filters: [{ extensions: [format], name: format.toUpperCase() }],
      })
      expect(invoke).toHaveBeenCalledWith('export_workspace_publication', {
        chapters,
        options,
        outputPath: `/exports/book.${format}`,
      })
    },
  )

  it('does not queue a publication when the save dialog is cancelled', async () => {
    vi.mocked(saveDialog).mockResolvedValue(null)
    await workspacePublicationApi.exportPublication([], defaultPublicationOptions(), '/notes')
    expect(invoke).not.toHaveBeenCalled()
  })
})
