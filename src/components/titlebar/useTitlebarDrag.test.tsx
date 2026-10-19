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
    <header {...drag}>
      <span>Window title</span>
      <button type="button">
        <svg aria-label="Menu control">
          <path />
        </svg>
      </button>
      <div data-no-drag>
        <span>Excluded chrome</span>
      </div>
      <a href="#menu">Menu link</a>
      <input aria-label="Search" />
      <span role="menuitem">Menu item</span>
      <span role="tab" tabIndex={0}>
        Workspace tab
      </span>
      <div contentEditable suppressContentEditableWarning>
        Editable title
      </div>
    </header>
  )
}
const secondClick = (target: HTMLElement, x = 120, y = 20) => {
  const event = { button: 0, detail: 2, clientX: x, clientY: y }
  fireEvent.mouseDown(target, event)
  fireEvent.mouseUp(target, event)
}
beforeEach(() => {
  vi.clearAllMocks()
  native.desktop = true
  native.getWindow.mockReset().mockResolvedValue(handle)
  handle.isMaximized.mockReset().mockResolvedValue(false)
  handle.maximize.mockReset().mockResolvedValue(undefined)
  handle.unmaximize.mockReset().mockResolvedValue(undefined)
})

describe('native titlebar dragging and resizing', () => {
  it('drags plain titlebar content on a primary press', async () => {
    render(<Chrome />)
    fireEvent.mouseDown(screen.getByText('Window title'), { button: 0, detail: 1 })
    await waitFor(() => expect(handle.startDragging).toHaveBeenCalledOnce())
    expect(handle.maximize).not.toHaveBeenCalled()
  })

  it.each(['macos', 'windows', 'linux'] as const)(
    'maximizes and restores at the native second-click timing on %s without double toggling',
    async (platform) => {
      render(<Chrome platform={platform} />)
      const title = screen.getByText('Window title')
      const event = { button: 0, detail: 2, clientX: 120, clientY: 20 }
      fireEvent.mouseDown(title, event)
      if (platform === 'macos') {
        expect(native.getWindow).not.toHaveBeenCalled()
        fireEvent.mouseUp(title, event)
      }
      await waitFor(() => expect(handle.maximize).toHaveBeenCalledOnce())
      // A later release or browser dblclick must not apply a second resize,
      // even after the first native operation has completed.
      fireEvent.mouseUp(title, event)
      fireEvent.doubleClick(title, event)
      expect(handle.maximize).toHaveBeenCalledOnce()
      expect(native.getWindow).toHaveBeenCalledOnce()
      expect(handle.startDragging).not.toHaveBeenCalled()
      handle.isMaximized.mockResolvedValue(true)
      secondClick(title)
      await waitFor(() => expect(handle.unmaximize).toHaveBeenCalledOnce())
    },
  )

  it('cancels macOS resizing when the pointer moves or the second press is missing', () => {
    render(<Chrome />)
    const title = screen.getByText('Window title')
    fireEvent.mouseUp(title, { button: 0, detail: 2, clientX: 120, clientY: 20 })
    fireEvent.mouseDown(title, { button: 0, detail: 2, clientX: 120, clientY: 20 })
    fireEvent.mouseMove(title, { clientX: 124, clientY: 20 })
    fireEvent.mouseUp(title, { button: 0, detail: 2, clientX: 124, clientY: 20 })
    fireEvent.mouseUp(title, { button: 0, detail: 2, clientX: 120, clientY: 20 })
    expect(native.getWindow).not.toHaveBeenCalled()
  })

  it('does not drag or resize interactive descendants or explicit exclusions', () => {
    render(<Chrome />)
    const excluded = [
      screen.getByLabelText('Menu control'),
      screen.getByText('Excluded chrome'),
      screen.getByText('Menu link'),
      screen.getByLabelText('Search'),
      screen.getByRole('menuitem'),
      screen.getByRole('tab'),
      screen.getByText('Editable title'),
    ]
    for (const target of excluded) {
      fireEvent.mouseDown(target, { button: 0 })
      secondClick(target)
    }
    expect(native.getWindow).not.toHaveBeenCalled()
  })

  it('preserves secondary clicks, consumed events and browser selection', () => {
    render(<Chrome />)
    const title = screen.getByText('Window title')
    fireEvent.mouseDown(title, { button: 2 })
    fireEvent.mouseUp(title, { button: 2, detail: 2 })
    title.addEventListener('mousedown', (event) => event.preventDefault(), { once: true })
    secondClick(title)
    native.desktop = false
    fireEvent.mouseDown(title, { button: 0 })
    secondClick(title)
    expect(native.getWindow).not.toHaveBeenCalled()
  })

  it('contains native action failures and permits another resize attempt', async () => {
    render(<Chrome />)
    const title = screen.getByText('Window title')
    native.getWindow.mockResolvedValueOnce(null)
    fireEvent.mouseDown(title, { button: 0 })
    await waitFor(() => expect(native.getWindow).toHaveBeenCalledOnce())
    expect(handle.startDragging).not.toHaveBeenCalled()
    const failure = new Error('Window no longer exists')
    native.getWindow.mockRejectedValueOnce(failure)
    fireEvent.mouseDown(title, { button: 0 })
    await waitFor(() =>
      expect(native.warn).toHaveBeenCalledWith('window.titlebar', 'native-action-failed', failure),
    )
    handle.maximize.mockRejectedValueOnce(failure)
    secondClick(title)
    await waitFor(() => expect(native.warn).toHaveBeenCalledTimes(2))
    secondClick(title)
    await waitFor(() => expect(handle.maximize).toHaveBeenCalledTimes(2))
  })

  it('coalesces pending double clicks and tolerates an unavailable native window', async () => {
    render(<Chrome />)
    const title = screen.getByText('Window title')
    let resolveWindow: (value: typeof handle | null) => void = () => undefined
    native.getWindow.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveWindow = resolve
      }),
    )
    secondClick(title)
    secondClick(title)
    expect(native.getWindow).toHaveBeenCalledOnce()
    resolveWindow(null)
    await waitFor(() => expect(handle.maximize).not.toHaveBeenCalled())
    // Flush the completed request's finally handler before retrying.
    await Promise.resolve()
    secondClick(title)
    await waitFor(() => expect(handle.maximize).toHaveBeenCalledOnce())
  })
})
