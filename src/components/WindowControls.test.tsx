import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WindowControls from '@/components/WindowControls'
import { useState } from 'react'

const runtimeMock = vi.hoisted(() => ({
  isDesktopRuntime: vi.fn(() => true),
  subscribe: vi.fn(),
  warn: vi.fn(),
  toast: vi.fn(),
  maximized: undefined as undefined | ((maximized: boolean) => void),
}))

vi.mock('@/runtime/window', () => ({
  isDesktopRuntime: runtimeMock.isDesktopRuntime,
  onWindowMaximizedChanged: runtimeMock.subscribe,
}))
vi.mock('@/services/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: runtimeMock.warn },
}))
vi.mock('sonner', () => ({ toast: { error: runtimeMock.toast } }))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        'actions.close': 'Close',
        'actions.maximize': 'Maximize',
        'actions.minimize': 'Minimize',
        'actions.restore': 'Restore',
        'actions.windowControls': 'Window controls',
      }

      return labels[key] ?? key
    },
  }),
}))

const createWindowHandle = (maximized: boolean) => ({
  close: vi.fn().mockResolvedValue(undefined),
  isMaximized: vi.fn().mockResolvedValue(maximized),
  maximize: vi.fn(async () => {
    runtimeMock.maximized?.(true)
  }),
  minimize: vi.fn().mockResolvedValue(undefined),
  unmaximize: vi.fn(async () => {
    runtimeMock.maximized?.(false)
  }),
})

const StatefulControls = () => {
  const [isMaximized, setIsMaximized] = useState(false)
  return (
    <WindowControls
      platform="windows"
      isWindows
      isMaximized={isMaximized}
      setIsMaximized={setIsMaximized}
      getAppWindow={vi.fn()}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  runtimeMock.isDesktopRuntime.mockReturnValue(true)
  runtimeMock.maximized = undefined
  runtimeMock.subscribe.mockImplementation(async (handler) => {
    runtimeMock.maximized = handler
    return vi.fn()
  })
})

describe('WindowControls', () => {
  it('exposes caption buttons with stable accessible names and button types', async () => {
    const windowHandle = createWindowHandle(false)
    const setIsMaximized = vi.fn()
    const getAppWindow = vi.fn().mockResolvedValue(windowHandle)

    render(
      <WindowControls
        platform="windows"
        isWindows={true}
        isMaximized={false}
        setIsMaximized={setIsMaximized}
        getAppWindow={getAppWindow}
      />,
    )

    const group = screen.getByRole('group', { name: 'Window controls' })
    const minimizeButton = within(group).getByRole('button', { name: 'Minimize' })
    const maximizeButton = within(group).getByRole('button', { name: 'Maximize' })
    const closeButton = within(group).getByRole('button', { name: 'Close' })

    expect(minimizeButton).toHaveAttribute('type', 'button')
    expect(maximizeButton).toHaveAttribute('title', 'Maximize')
    expect(closeButton).toHaveAttribute('title', 'Close')

    fireEvent.click(minimizeButton)
    await waitFor(() => expect(minimizeButton).not.toBeDisabled())
    fireEvent.click(maximizeButton)
    await waitFor(() => expect(maximizeButton).not.toBeDisabled())
    fireEvent.click(closeButton)

    await waitFor(() => {
      expect(windowHandle.minimize).toHaveBeenCalledTimes(1)
      expect(windowHandle.maximize).toHaveBeenCalledTimes(1)
      expect(windowHandle.close).toHaveBeenCalledTimes(1)
      expect(setIsMaximized).toHaveBeenCalledWith(true)
    })
  })

  it('uses the restore action when the window is maximized', async () => {
    const windowHandle = createWindowHandle(true)
    const setIsMaximized = vi.fn()

    render(
      <WindowControls
        platform="windows"
        isWindows={true}
        isMaximized={true}
        setIsMaximized={setIsMaximized}
        getAppWindow={vi.fn().mockResolvedValue(windowHandle)}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))

    await waitFor(() => {
      expect(windowHandle.unmaximize).toHaveBeenCalledTimes(1)
      expect(setIsMaximized).toHaveBeenCalledWith(false)
    })
  })

  it('uses hidden SVG icons for linux caption controls instead of exposed text glyphs', () => {
    render(
      <WindowControls
        platform="linux"
        isWindows={false}
        isMaximized={false}
        setIsMaximized={vi.fn()}
        getAppWindow={vi.fn()}
      />,
    )

    const group = screen.getByRole('group', { name: 'Window controls' })
    const minimizeButton = within(group).getByRole('button', { name: 'Minimize' })
    const maximizeButton = within(group).getByRole('button', { name: 'Maximize' })
    const closeButton = within(group).getByRole('button', { name: 'Close' })

    expect(minimizeButton.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(maximizeButton.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(closeButton.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(group).not.toHaveTextContent('-□×')
  })

  it('does not render caption controls outside the desktop runtime', () => {
    runtimeMock.isDesktopRuntime.mockReturnValue(false)

    const { container } = render(
      <WindowControls
        platform="windows"
        isWindows={true}
        isMaximized={false}
        setIsMaximized={vi.fn()}
        getAppWindow={vi.fn()}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('reflects restored geometry and later native maximize/restore events', async () => {
    runtimeMock.subscribe.mockImplementationOnce(async (handler) => {
      runtimeMock.maximized = handler
      handler(true)
      return vi.fn()
    })
    render(<StatefulControls />)
    expect(await screen.findByRole('button', { name: 'Restore' })).toHaveTextContent('\uE923')
    act(() => runtimeMock.maximized?.(false))
    expect(screen.getByRole('button', { name: 'Maximize' })).toHaveTextContent('\uE922')
  })

  it('shows dirty-close failure, clears pending state, and allows retry', async () => {
    const handle = createWindowHandle(false)
    const error = new Error('External disk conflict')
    handle.close.mockRejectedValueOnce(error)
    render(
      <WindowControls
        platform="windows"
        isWindows
        isMaximized={false}
        setIsMaximized={vi.fn()}
        getAppWindow={vi.fn().mockResolvedValue(handle)}
      />,
    )
    const close = screen.getByRole('button', { name: 'Close' })
    fireEvent.click(close)
    await waitFor(() =>
      expect(runtimeMock.toast).toHaveBeenCalledWith('editor.flushBuffersFailed', {
        description: 'External disk conflict',
      }),
    )
    expect(runtimeMock.warn).toHaveBeenCalledWith('window.controls', 'native-action-failed', error)
    await waitFor(() => expect(close).not.toBeDisabled())
    fireEvent.click(close)
    await waitFor(() => expect(handle.close).toHaveBeenCalledTimes(2))
  })

  it('prevents duplicate caption actions while the native handle is pending', async () => {
    const handle = createWindowHandle(false)
    let complete: (value: typeof handle) => void = () => undefined
    const getWindow = vi.fn(
      () =>
        new Promise<typeof handle>((resolve) => {
          complete = resolve
        }),
    )
    render(
      <WindowControls
        platform="windows"
        isWindows
        isMaximized={false}
        setIsMaximized={vi.fn()}
        getAppWindow={getWindow}
      />,
    )
    const minimize = screen.getByRole('button', { name: 'Minimize' })
    fireEvent.click(minimize)
    fireEvent.click(minimize)
    expect(minimize).toBeDisabled()
    expect(getWindow).toHaveBeenCalledOnce()
    complete(handle)
    await waitFor(() => expect(handle.minimize).toHaveBeenCalledOnce())
    await waitFor(() => expect(minimize).not.toBeDisabled())
  })
})
