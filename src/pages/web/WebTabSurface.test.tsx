import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WebTabState } from '@/types/webTabs'
import { useNativeSurfaceInsetsStore } from '@/app/nativeSurfaceInsets'

const native = vi.hoisted(() => ({
  hostRef: vi.fn(),
  state: {
    active: true,
    canGoBack: true,
    canGoForward: false,
    status: 'loading' as const,
    tabId: 'web-id',
    title: 'Docs',
    url: 'https://example.com/docs',
  } as WebTabState,
}))
const actions = vi.hoisted(() => ({
  close: vi.fn(),
  goBack: vi.fn(),
  goForward: vi.fn(),
  navigate: vi.fn(),
  reload: vi.fn(),
  stop: vi.fn(),
}))

vi.mock('@/pages/web/useWebTabNativeView', () => ({
  useWebTabNativeView: () => native,
}))
vi.mock('@/pages/web/useWebTabActions', () => ({
  useWebTabActions: () => actions,
}))
vi.mock('@/app/useOpenWebTab', () => ({
  useOpenWebTab: () => vi.fn(),
}))

import WebTabSurface from '@/pages/web/WebTabSurface'

beforeEach(() => {
  vi.clearAllMocks()
  useNativeSurfaceInsetsStore.setState({ toastHeight: 0 } as never)
  native.state = {
    active: true,
    canGoBack: true,
    canGoForward: false,
    status: 'loading',
    tabId: 'web-id',
    title: 'Docs',
    url: 'https://example.com/docs',
  }
})

describe('WebTabSurface', () => {
  it('keeps browser chrome outside the native host and exposes navigation controls', () => {
    render(
      <WebTabSurface
        suspended={false}
        tab={{ kind: 'web', id: 'web-id', title: 'Docs', url: 'https://example.com/docs' }}
      />,
    )

    expect(screen.getByRole('toolbar', { name: 'Web navigation' })).toBeVisible()
    const nativeHost = screen.getByTestId('web-tab-native-host')
    expect(nativeHost).toHaveClass('ml-5')
    expect(nativeHost).toHaveAttribute('data-native-status', 'loading')
    expect(nativeHost).toHaveAttribute('data-native-active', 'true')
    expect(nativeHost).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Loading webpage')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stop loading' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Web address' }), {
      target: { value: 'example.org/next' },
    })
    fireEvent.submit(screen.getByRole('textbox', { name: 'Web address' }).closest('form')!)

    expect(actions.goBack).toHaveBeenCalled()
    expect(actions.stop).toHaveBeenCalled()
    expect(actions.navigate).toHaveBeenCalledWith('https://example.org/next')
  })

  it('shows an actionable error without mounting native content over it', () => {
    native.state = {
      ...native.state,
      status: 'error',
      error: { description: 'Network unavailable' },
    }
    render(
      <WebTabSurface
        suspended={false}
        tab={{ kind: 'web', id: 'web-id', title: 'Docs', url: 'https://example.com/docs' }}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Network unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(actions.reload).toHaveBeenCalled()
  })

  it('exposes when a ready native surface is inactive', () => {
    native.state = {
      ...native.state,
      active: false,
      status: 'ready',
    }
    render(
      <WebTabSurface
        suspended={false}
        tab={{ kind: 'web', id: 'web-id', title: 'Docs', url: 'https://example.com/docs' }}
      />,
    )

    const nativeHost = screen.getByTestId('web-tab-native-host')
    expect(nativeHost).toHaveAttribute('data-native-status', 'ready')
    expect(nativeHost).toHaveAttribute('data-native-active', 'false')
    expect(nativeHost).toHaveAttribute('aria-busy', 'false')
  })

  it('rejects an unsafe address with inline feedback', () => {
    render(
      <WebTabSurface
        suspended={false}
        tab={{ kind: 'web', id: 'web-id', title: 'Docs', url: 'https://example.com/docs' }}
      />,
    )
    const address = screen.getByRole('textbox', { name: 'Web address' })

    fireEvent.change(address, { target: { value: 'http://example.com' } })
    fireEvent.submit(address.closest('form')!)

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid HTTPS address')
    expect(actions.navigate).not.toHaveBeenCalled()
  })

  it('reserves the measured toast height instead of a fixed padding class', () => {
    useNativeSurfaceInsetsStore.setState({ toastHeight: 68 } as never)
    render(
      <WebTabSurface
        suspended={false}
        tab={{ kind: 'web', id: 'web-id', title: 'Docs', url: 'https://example.com/docs' }}
      />,
    )

    expect(screen.getByTestId('web-tab-native-host').parentElement).toHaveStyle({
      paddingBottom: '68px',
    })
    expect(screen.getByTestId('web-tab-native-host').parentElement).not.toHaveClass('pb-24')
  })
})
