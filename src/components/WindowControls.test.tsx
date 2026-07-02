import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WindowControls from '@/components/WindowControls'

const runtimeMock = vi.hoisted(() => ({
  isDesktopRuntime: vi.fn(() => true),
}))

vi.mock('@/runtime/window', () => ({
  isDesktopRuntime: runtimeMock.isDesktopRuntime,
}))

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
  maximize: vi.fn().mockResolvedValue(undefined),
  minimize: vi.fn().mockResolvedValue(undefined),
  unmaximize: vi.fn().mockResolvedValue(undefined),
})

beforeEach(() => {
  runtimeMock.isDesktopRuntime.mockReturnValue(true)
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
    fireEvent.click(maximizeButton)
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
})
