import { act, renderHook } from '@testing-library/react'
import type { KeyboardEvent } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCommandDialogController } from '@/components/command/useCommandDialogController'

vi.mock('@/components/command/useCommandSearchHistory', () => ({
  useCommandSearchHistory: () => ({
    searches: [],
    rememberSearch: vi.fn(),
    clearSearchHistory: vi.fn(),
  }),
}))

vi.mock('@/components/command/useCommandFullTextSearchStream', () => ({
  useCommandFullTextSearchStream: () => ({
    fullTextError: false,
    fullTextFetching: false,
    fullTextResults: [],
  }),
}))

const createKeyboardEvent = (
  key: string,
  overrides: Partial<KeyboardEvent<HTMLInputElement>> = {},
) =>
  ({
    altKey: false,
    ctrlKey: false,
    key,
    metaKey: false,
    preventDefault: vi.fn(),
    shiftKey: false,
    ...overrides,
  }) as unknown as KeyboardEvent<HTMLInputElement>

const renderController = (onOpenPathInNewWindow = vi.fn()) =>
  renderHook(() =>
    useCommandDialogController({
      contentReady: true,
      onOpenFile: vi.fn(),
      onOpenHeading: vi.fn(),
      onOpenPathInNewWindow,
      onOpenSearchResult: vi.fn(),
      open: false,
      workspaceKey: 'external:/workspace',
    }),
  )

afterEach(() => document.querySelectorAll('[cmdk-item]').forEach((item) => item.remove()))

describe('useCommandDialogController keyboard navigation', () => {
  it('cycles all four scopes from the input with Tab and Shift+Tab', () => {
    const { result } = renderController()
    const forward = createKeyboardEvent('Tab')
    act(() => result.current.handleInputKeyDown(forward))
    expect(forward.preventDefault).toHaveBeenCalledOnce()
    expect(result.current.mode).toBe('full-text')

    act(() => result.current.handleInputKeyDown(createKeyboardEvent('Tab')))
    expect(result.current.mode).toBe('commands')
    act(() => result.current.handleInputKeyDown(createKeyboardEvent('Tab')))
    expect(result.current.mode).toBe('settings')
    act(() => result.current.handleInputKeyDown(createKeyboardEvent('Tab', { shiftKey: true })))
    expect(result.current.mode).toBe('commands')
  })

  it('selects the settings scope with the fourth keyboard shortcut', () => {
    const { result } = renderController()
    act(() => result.current.handleInputKeyDown(createKeyboardEvent('4', { ctrlKey: true })))
    expect(result.current.mode).toBe('settings')
  })

  it('does not lose rapid consecutive scope changes before React rerenders', () => {
    const { result } = renderController()

    act(() => {
      result.current.handleInputKeyDown(createKeyboardEvent('Tab'))
      result.current.handleInputKeyDown(createKeyboardEvent('Tab'))
    })

    expect(result.current.mode).toBe('commands')
  })

  it('opens the selected file in a new window on Alt+Enter when supported', () => {
    const onOpenPathInNewWindow = vi.fn()
    const selected = document.createElement('div')
    selected.setAttribute('cmdk-item', '')
    selected.dataset.selected = 'true'
    selected.dataset.openNewWindowPath = 'docs/Guide.md'
    document.body.append(selected)
    const { result } = renderController(onOpenPathInNewWindow)
    const event = createKeyboardEvent('Enter', { altKey: true })

    act(() => result.current.handleInputKeyDown(event))

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(onOpenPathInNewWindow).toHaveBeenCalledWith('docs/Guide.md')
  })
})
