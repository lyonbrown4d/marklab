import { act, renderHook } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProjectLoader } from '@/app/useProjectLoader'
import { openDialog } from '@/runtime/dialog'
import { runInDesktop } from '@/runtime/environment'

const messages: Record<string, string> = {
  'projectLoader.openPathFailed': 'Failed to open path',
  'projectLoader.selectFolderFailed': 'Failed to select folder',
}

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

vi.mock('@/runtime/dialog', () => ({
  openDialog: vi.fn(),
}))

vi.mock('@/runtime/environment', () => ({
  runInDesktop: vi.fn(),
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => messages[key] ?? key,
  }),
}))

const createProps = (overrides: Record<string, unknown> = {}) => ({
  rootPath: 'D:/notes',
  rootKind: 'external',
  entries: [],
  tabs: [],
  activeTabId: null,
  locationPathname: '/',
  preserveCurrentRoute: false,
  defaultFileView: 'wysiwyg',
  navigate: vi.fn(),
  setEntries: vi.fn(),
  setRootPath: vi.fn(),
  setRootKind: vi.fn(),
  setTabs: vi.fn(),
  setActiveTabId: vi.fn(),
  touchRecentProject: vi.fn(),
  ...overrides,
})

describe('useProjectLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(openDialog).mockReset()
    vi.mocked(runInDesktop).mockReset()
    vi.mocked(runInDesktop).mockImplementation((callback) => Promise.resolve(callback()))
  })

  it('shows localized feedback when opening a desktop path fails', async () => {
    vi.mocked(runInDesktop).mockRejectedValue(new Error('permission denied'))
    const { result } = renderHook(() => useProjectLoader(createProps() as never))

    await act(async () => {
      await result.current.openFolder('D:/locked-note.md')
    })

    expect(toast.error).toHaveBeenCalledWith('Failed to open path', {
      description: 'D:/locked-note.md\npermission denied',
    })
  })

  it('shows localized feedback when folder selection fails', async () => {
    vi.mocked(openDialog).mockRejectedValue(new Error('dialog unavailable'))
    const { result } = renderHook(() => useProjectLoader(createProps() as never))

    await act(async () => {
      await result.current.onSelectFolder()
    })

    expect(toast.error).toHaveBeenCalledWith('Failed to select folder', {
      description: 'dialog unavailable',
    })
  })
})
