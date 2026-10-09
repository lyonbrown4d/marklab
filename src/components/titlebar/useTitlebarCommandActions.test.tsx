import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { appApi } from '@/services/appApi'
import { useTitlebarCommandActions } from '@/components/titlebar/useTitlebarCommandActions'

vi.mock('@/services/appApi', () => ({
  appApi: {
    menuDispatch: vi.fn(),
    openPathInNewWindow: vi.fn(),
  },
}))

const createOptions = () => ({
  canCreateWorkspaceEntries: true,
  onChangeView: vi.fn(),
  onCloseActiveTab: vi.fn(),
  onCommandOpenChange: vi.fn(),
  onCreateFile: vi.fn(),
  onCreateFolder: vi.fn(),
  onOpenAllPages: vi.fn(),
  onOpenCurrentWorkspaceInNewWindow: vi.fn(),
  onOpenFile: vi.fn(),
  onOpenHeading: vi.fn(),
  onOpenSearchResult: vi.fn(),
  onOpenSettings: vi.fn(),
  onOpenTerminal: vi.fn(),
  onOpenWorkspaceGraph: vi.fn(),
  onRebuildSearchIndex: vi.fn(),
  onSelectProject: vi.fn(),
  onSelectSingleFile: vi.fn(),
  onToggleReadOnly: vi.fn(),
  onToggleRightSidebar: vi.fn(),
  onToggleSidebar: vi.fn(),
  rootKind: 'external' as const,
  rootPath: 'C:/notes',
  setTheme: vi.fn(),
})

afterEach(() => vi.restoreAllMocks())

describe('useTitlebarCommandActions new-window results', () => {
  it('closes the palette and opens the resolved result through the typed app service', async () => {
    vi.mocked(appApi.openPathInNewWindow).mockResolvedValue({
      ok: true,
      sharedWorkspaceSession: false,
    })
    const options = createOptions()
    const { result } = renderHook(() => useTitlebarCommandActions(options))

    act(() => result.current.onCommandOpenPathInNewWindow('docs/Guide.md'))

    expect(options.onCommandOpenChange).toHaveBeenCalledWith(false)
    await waitFor(() =>
      expect(appApi.openPathInNewWindow).toHaveBeenCalledWith('C:/notes/docs/Guide.md'),
    )
  })

  it('reports a rejected new-window request without an unhandled rejection', async () => {
    const failure = new Error('window unavailable')
    vi.mocked(appApi.openPathInNewWindow).mockRejectedValue(failure)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { result } = renderHook(() => useTitlebarCommandActions(createOptions()))

    act(() => result.current.onCommandOpenPathInNewWindow('docs/Guide.md'))

    await waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        'open command result in new window failed',
        failure,
      ),
    )
  })
})
