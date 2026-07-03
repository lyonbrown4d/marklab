import { act, renderHook, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppMenuAction } from '@/app/useAppMenuAction'
import { exportApi } from '@/services/exportApi'
import { requestExportContent } from '@/utils/exportContent'

const messages: Record<string, string> = {
  'appMenu.exportFailed': 'Export failed',
}

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
  }),
}))

vi.mock('@/runtime/environment', () => ({
  isDesktopRuntime: () => true,
}))

vi.mock('@/services/exportApi', () => ({
  exportApi: {
    exportMarkdown: vi.fn(),
  },
}))

vi.mock('@/utils/exportContent', () => ({
  requestExportContent: vi.fn(),
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => messages[key] ?? key,
  }),
}))

const createState = (overrides: Record<string, unknown> = {}) => ({
  activePath: 'notes/readme.md',
  rootPath: 'D:/notes',
  editorValue: '# Local draft',
  files: [],
  createFile: vi.fn(),
  onOpenFile: vi.fn(),
  onSelectProject: vi.fn(),
  onSelectSingleFile: vi.fn(),
  setViewMode: vi.fn(),
  toggleSidebar: vi.fn(),
  toggleRightSidebar: vi.fn(),
  setTheme: vi.fn(),
  ...overrides,
})

describe('useAppMenuAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requestExportContent).mockResolvedValue('# Export content')
    vi.mocked(exportApi.exportMarkdown).mockResolvedValue(undefined)
  })

  it('shows localized feedback when a desktop export action fails', async () => {
    vi.mocked(exportApi.exportMarkdown).mockRejectedValue(new Error('disk full'))
    const state = createState()
    const { result } = renderHook(() =>
      useAppMenuAction({
        stateRef: { current: state as never },
        openSettings: vi.fn(),
      }),
    )

    act(() => {
      result.current('file.export_pdf')
    })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Export failed', {
        description: 'Error: disk full',
      })
    })
    expect(requestExportContent).toHaveBeenCalledWith('# Local draft', {
      expectedActivePath: 'notes/readme.md',
    })
    expect(exportApi.exportMarkdown).toHaveBeenCalledWith('# Export content', 'pdf', {
      rootPath: 'D:/notes',
      activePath: 'notes/readme.md',
    })
  })
})
