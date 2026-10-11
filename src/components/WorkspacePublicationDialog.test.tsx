import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkspacePublicationDialog from '@/components/WorkspacePublicationDialog'
import { PlateDndProvider } from '@/components/plate/PlateDndProvider'
import { flushEditorChanges } from '@/app/editorCloseLifecycle'
import { workspacePublicationApi } from '@/services/workspacePublicationApi'

vi.mock('@/app/editorCloseLifecycle', () => ({ flushEditorChanges: vi.fn() }))
vi.mock('@/services/workspacePublicationApi', () => ({
  workspacePublicationApi: {
    exportPublication: vi.fn(),
    loadPlan: vi.fn(),
  },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      if (key === 'workspaceExport.export') return `Export ${values?.format}`
      if (key === 'workspaceExport.selected') return `${values?.selected}/${values?.total}`
      if (key === 'workspaceExport.pageOf') return `${values?.current}/${values?.total}`
      if (key === 'workspaceExport.pageCount') return `${values?.count} pages`
      if (key === 'workspaceExport.wordCount') return `${values?.count} words`
      return key
    },
  }),
}))

describe('WorkspacePublicationDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(flushEditorChanges).mockResolvedValue(undefined)
    vi.mocked(workspacePublicationApi.exportPublication).mockResolvedValue('export-pdf-1')
    vi.mocked(workspacePublicationApi.loadPlan).mockResolvedValue({
      chapters: [
        {
          depth: 0,
          estimatedPages: 2,
          excerpt: 'Introduction body',
          orphaned: false,
          path: 'intro.md',
          title: 'Introduction',
          wordCount: 500,
        },
        {
          depth: 1,
          estimatedPages: 1,
          excerpt: 'Details body',
          orphaned: false,
          path: 'details.md',
          title: 'Details',
          wordCount: 220,
        },
      ],
      estimatedPages: 5,
      orphanCount: 0,
      title: 'Product Guide',
      totalWords: 720,
    })
  })

  it('excludes chapters and exports the remaining ordered selection', async () => {
    const onOpenChange = vi.fn()
    render(
      <PlateDndProvider>
        <WorkspacePublicationDialog onOpenChange={onOpenChange} open rootPath="/workspace" />
      </PlateDndProvider>,
    )

    await screen.findAllByText('Product Guide')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Details' }))
    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }))

    await waitFor(() => expect(workspacePublicationApi.exportPublication).toHaveBeenCalledOnce())
    expect(workspacePublicationApi.exportPublication).toHaveBeenCalledWith(
      [{ path: 'intro.md', title: 'Introduction' }],
      expect.objectContaining({ format: 'pdf', locale: 'zh-CN', title: 'Product Guide' }),
      '/workspace',
    )
    expect(flushEditorChanges).toHaveBeenCalledOnce()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
