import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTitlebarDrag } from '@/components/titlebar/useTitlebarDrag'
import type { AppPlatform } from '@/services/appApi'

const native = vi.hoisted(() => ({ desktop: true, warn: vi.fn(), getWindow: vi.fn() }))
vi.mock('@/runtime/window', () => ({ isDesktopRuntime: () => native.desktop }))
vi.mock('@/services/rendererDiagnostics', () => ({ rendererDiagnostics: { warn: native.warn } }))

const handle = {
  startDragging: vi.fn(async () => undefined),
  isMaximized: vi.fn(async () => false),
  maximize: vi.fn(async () => undefined),
  unmaximize: vi.fn(async () => undefined),
}
const Chrome = ({ platform = 'macos' }: { platform?: AppPlatform }) => {
  const drag = useTitlebarDrag(platform, native.getWindow)
  return (
    <header onMouseDown={drag}>
      <span>Window title</span>
      <button type="button">
        <span>Menu control</span>
      </button>
      <div data-no-drag>
        <span>Excluded chrome</span>
      </div>
    </header>
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  native.desktop = true
  native.getWindow.mockReset().mockResolvedValue(handle)
  handle.isMaximized.mockResolvedValue(false)
})

describe('native titlebar dragging', () => {
  it.each(['macos', 'windows', 'linux'] as const)(
    'drags plain titlebar content on %s',
    async (platform) => {
      render(<Chrome platform={platform} />)
      fireEvent.mouseDown(screen.getByText('Window title'), { button: 0 })
      await waitFor(() => expect(handle.startDragging).toHaveBeenCalledOnce())
    },
  )

  it('preserves buttons, explicit exclusions, secondary clicks and browser selection', () => {
    render(<Chrome />)
    fireEvent.mouseDown(screen.getByText('Menu control'), { button: 0 })
    fireEvent.mouseDown(screen.getByText('Excluded chrome'), { button: 0 })
    fireEvent.mouseDown(screen.getByText('Window title'), { button: 2 })
    native.desktop = false
    fireEvent.mouseDown(screen.getByText('Window title'), { button: 0 })
    expect(native.getWindow).not.toHaveBeenCalled()
  })

  it('toggles maximize on non-macOS double click without starting a drag', async () => {
    render(<Chrome platform="windows" />)
    fireEvent.mouseDown(screen.getByText('Window title'), { button: 0, detail: 2 })
    await waitFor(() => expect(handle.maximize).toHaveBeenCalledOnce())
    handle.isMaximized.mockResolvedValue(true)
    fireEvent.mouseDown(screen.getByText('Window title'), { button: 0, detail: 2 })
    await waitFor(() => expect(handle.unmaximize).toHaveBeenCalledOnce())
    expect(handle.startDragging).not.toHaveBeenCalled()
  })

  it('contains native dragging failure and tolerates browser-preview handles', async () => {
    render(<Chrome />)
    native.getWindow.mockResolvedValueOnce(null)
    fireEvent.mouseDown(screen.getByText('Window title'), { button: 0 })
    await waitFor(() => expect(native.getWindow).toHaveBeenCalledOnce())
    expect(handle.startDragging).not.toHaveBeenCalled()
    const failure = new Error('Window no longer exists')
    native.getWindow.mockRejectedValueOnce(failure)
    fireEvent.mouseDown(screen.getByText('Window title'), { button: 0 })
    await waitFor(() =>
      expect(native.warn).toHaveBeenCalledWith('window.titlebar', 'native-action-failed', failure),
    )
  })
})
