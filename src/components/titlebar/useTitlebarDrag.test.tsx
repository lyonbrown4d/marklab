import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTitlebarDrag } from '@/components/titlebar/useTitlebarDrag'

const native = vi.hoisted(() => ({ desktop: true, warn: vi.fn(), getWindow: vi.fn() }))
vi.mock('@/runtime/window', () => ({ isDesktopRuntime: () => native.desktop }))
vi.mock('@/services/rendererDiagnostics', () => ({ rendererDiagnostics: { warn: native.warn } }))

const handle = {
  startDragging: vi.fn(async () => undefined),
  isMaximized: vi.fn(async () => false),
  maximize: vi.fn(async () => undefined),
  unmaximize: vi.fn(async () => undefined),
}
const Chrome = () => {
  const drag = useTitlebarDrag(native.getWindow)
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

  it('maximizes and restores on double click, including macOS without custom caption buttons', async () => {
    const user = userEvent.setup()
    render(<Chrome />)
    const title = screen.getByText('Window title')
    await user.dblClick(title)
    await waitFor(() => expect(handle.maximize).toHaveBeenCalledOnce())
    // Only the first press starts a drag; the second press preserves double click.
    expect(handle.startDragging).toHaveBeenCalledOnce()
    handle.isMaximized.mockResolvedValue(true)
    await user.dblClick(title)
    await waitFor(() => expect(handle.unmaximize).toHaveBeenCalledOnce())
    expect(handle.startDragging).toHaveBeenCalledTimes(2)
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
      fireEvent.doubleClick(target, { button: 0 })
    }
    expect(native.getWindow).not.toHaveBeenCalled()
  })

  it('preserves secondary clicks, consumed events and browser selection', () => {
    render(<Chrome />)
    const title = screen.getByText('Window title')
    fireEvent.mouseDown(title, { button: 2 })
    fireEvent.doubleClick(title, { button: 2 })
    title.addEventListener('dblclick', (event) => event.preventDefault(), { once: true })
    fireEvent.doubleClick(title, { button: 0 })
    native.desktop = false
    fireEvent.mouseDown(title, { button: 0 })
    fireEvent.doubleClick(title, { button: 0 })
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
    fireEvent.doubleClick(title, { button: 0 })
    await waitFor(() => expect(native.warn).toHaveBeenCalledTimes(2))
    fireEvent.doubleClick(title, { button: 0 })
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
    fireEvent.doubleClick(title, { button: 0 })
    fireEvent.doubleClick(title, { button: 0 })
    expect(native.getWindow).toHaveBeenCalledOnce()
    resolveWindow(null)
    await waitFor(() => expect(handle.maximize).not.toHaveBeenCalled())
    // Flush the completed request's finally handler before retrying.
    await Promise.resolve()
    fireEvent.doubleClick(title, { button: 0 })
    await waitFor(() => expect(handle.maximize).toHaveBeenCalledOnce())
  })
})
