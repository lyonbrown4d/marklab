import { act, renderHook } from '@testing-library/react'
import type { PlateEditor } from 'platejs/react'
import type { CompletionItem } from 'vscode-languageserver-types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlateCodeCompletion } from '@/components/plate/code/usePlateCodeCompletion'

const mocks = vi.hoisted(() => ({
  applyCompletion: vi.fn(),
  controllers: [] as Array<{
    cancel: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
    complete: ReturnType<typeof vi.fn>
    updateText: ReturnType<typeof vi.fn>
  }>,
  completionCallbacks: [] as Array<(items: CompletionItem[]) => void>,
}))

vi.mock('@/components/plate/code/plateCodeCompletionController', () => ({
  createPlateCodeCompletionController: vi.fn(
    ({ onCompletions }: { onCompletions: (items: CompletionItem[]) => void }) => {
      const controller = {
        cancel: vi.fn(),
        close: vi.fn().mockResolvedValue(undefined),
        complete: vi.fn(),
        updateText: vi.fn(),
      }
      mocks.controllers.push(controller)
      mocks.completionCallbacks.push(onCompletions)
      return controller
    },
  ),
}))

vi.mock('@/components/plate/code/plateCodeCompletionEdits', () => ({
  applyPlateCodeCompletion: mocks.applyCompletion,
  pointToEmbeddedPosition: vi.fn(() => ({ character: 0, line: 0 })),
  readPlateCodeSource: vi.fn(() => 'graph TD'),
}))

const createEditor = () => {
  const root = document.createElement('div')
  return {
    api: { toDOMNode: vi.fn(() => root) },
    selection: { anchor: { offset: 0, path: [0, 0] }, focus: { offset: 0, path: [0, 0] } },
  } as unknown as PlateEditor
}

describe('usePlateCodeCompletion', () => {
  beforeEach(() => {
    mocks.applyCompletion.mockClear()
    mocks.controllers.length = 0
    mocks.completionCallbacks.length = 0
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    document.body.replaceChildren()
  })

  it.each([
    ['language', { language: 'typescript', path: [0] }],
    ['path', { language: 'mermaid', path: [1] }],
  ])('clears suggestions and ignores the old session when %s changes', (_, nextProps) => {
    const editor = createEditor()
    const { rerender, result } = renderHook(
      ({ language, path }) =>
        usePlateCodeCompletion({ editor, language, path, source: 'graph TD' }),
      { initialProps: { language: 'mermaid', path: [0] } },
    )
    act(() => mocks.completionCallbacks[0]?.([{ label: 'flowchart' }]))
    expect(result.current.items).toHaveLength(1)

    rerender(nextProps)
    act(() => mocks.completionCallbacks[0]?.([{ label: 'stale' }]))

    expect(mocks.controllers[0]?.cancel).toHaveBeenCalledOnce()
    expect(mocks.controllers[0]?.close).toHaveBeenCalledOnce()
    expect(result.current.items).toEqual([])
  })

  it('clears suggestions and ignores the old session when the editor changes', () => {
    const firstEditor = createEditor()
    const secondEditor = createEditor()
    const { rerender, result } = renderHook(
      ({ editor }) =>
        usePlateCodeCompletion({ editor, language: 'mermaid', path: [0], source: 'graph TD' }),
      { initialProps: { editor: firstEditor } },
    )
    act(() => mocks.completionCallbacks[0]?.([{ label: 'flowchart' }]))

    rerender({ editor: secondEditor })
    act(() => mocks.completionCallbacks[0]?.([{ label: 'stale' }]))

    expect(mocks.controllers[0]?.cancel).toHaveBeenCalledOnce()
    expect(mocks.controllers[0]?.close).toHaveBeenCalledOnce()
    expect(result.current.items).toEqual([])
  })

  it('cancels a delayed request from an old session before it can use a new controller', () => {
    vi.useFakeTimers()
    const editor = createEditor()
    const { rerender, result } = renderHook(
      ({ path }) =>
        usePlateCodeCompletion({ editor, language: 'mermaid', path, source: 'graph TD' }),
      { initialProps: { path: [0] } },
    )

    act(() => result.current.onInput())
    rerender({ path: [1] })
    act(() => vi.runAllTimers())

    expect(mocks.controllers[0]?.complete).not.toHaveBeenCalled()
    expect(mocks.controllers[1]?.complete).not.toHaveBeenCalled()

    act(() => {
      result.current.onInput()
      vi.runAllTimers()
    })
    expect(mocks.controllers[1]?.complete).toHaveBeenCalledOnce()
  })

  it.each(['onInput', 'onPointerUp'] as const)(
    'clears visible suggestions immediately on %s before requesting replacements',
    (requestAfterChange) => {
      vi.useFakeTimers()
      const editor = createEditor()
      const { result } = renderHook(() =>
        usePlateCodeCompletion({ editor, language: 'mermaid', path: [0], source: 'graph TD' }),
      )
      act(() => mocks.completionCallbacks[0]?.([{ label: 'stale completion' }]))
      expect(result.current.items).toHaveLength(1)

      act(() => result.current[requestAfterChange]())

      expect(result.current.items).toEqual([])
      act(() =>
        result.current.onKeyDown({
          ctrlKey: false,
          key: 'Enter',
          metaKey: false,
          nativeEvent: { isComposing: false },
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        } as never),
      )
      expect(mocks.applyCompletion).not.toHaveBeenCalled()
    },
  )

  it.each(['blur', 'pagehide'])('cancels requests and clears suggestions on %s', (eventName) => {
    vi.useFakeTimers()
    const editor = createEditor()
    const { result } = renderHook(() =>
      usePlateCodeCompletion({ editor, language: 'mermaid', path: [0], source: 'graph TD' }),
    )
    act(() => mocks.completionCallbacks[0]?.([{ label: 'flowchart' }]))
    act(() => result.current.onInput())

    act(() => window.dispatchEvent(new Event(eventName)))
    act(() => vi.runAllTimers())
    act(() => mocks.completionCallbacks[0]?.([{ label: 'stale' }]))

    expect(mocks.controllers[0]?.cancel).toHaveBeenCalledOnce()
    expect(mocks.controllers[0]?.complete).not.toHaveBeenCalled()
    expect(result.current.items).toEqual([])
  })

  it('cancels requests and clears suggestions when the document becomes hidden', () => {
    const editor = createEditor()
    const { result } = renderHook(() =>
      usePlateCodeCompletion({ editor, language: 'mermaid', path: [0], source: 'graph TD' }),
    )
    act(() => mocks.completionCallbacks[0]?.([{ label: 'flowchart' }]))
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')

    act(() => document.dispatchEvent(new Event('visibilitychange')))

    expect(mocks.controllers[0]?.cancel).toHaveBeenCalledOnce()
    expect(result.current.items).toEqual([])
  })

  it('connects the editor to the rendered cmdk list and active option', () => {
    const editor = createEditor()
    const root = editor.api.toDOMNode(editor) as HTMLElement
    const { result } = renderHook(() =>
      usePlateCodeCompletion({ editor, language: 'mermaid', path: [0], source: 'graph TD' }),
    )
    const menu = document.createElement('div')
    menu.id = result.current.menuId
    const listbox = document.createElement('div')
    listbox.id = 'cmdk-list-id'
    listbox.setAttribute('role', 'listbox')
    menu.append(listbox)
    document.body.append(menu)

    act(() => mocks.completionCallbacks[0]?.([{ label: 'flowchart' }]))

    expect(root).toHaveAttribute('aria-controls', 'cmdk-list-id')
    expect(root).toHaveAttribute(
      'aria-activedescendant',
      `${result.current.menuId}-option-flowchart-0`,
    )
    menu.remove()
  })
})
