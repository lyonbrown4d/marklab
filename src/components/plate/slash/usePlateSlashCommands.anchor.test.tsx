import { act, renderHook } from '@testing-library/react'
import { createPlateEditor } from 'platejs/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPlateEditorPlugins } from '@/components/plate/plateEditorConfig'
import { plateSlashTestLabels as labels } from '@/components/plate/slash/testFixtures'
import { usePlateSlashCommands } from '@/components/plate/slash/usePlateSlashCommands'

type Geometry = {
  container: Node
  rects: Array<{ bottom: number; height: number; left: number; width: number }>
}

let geometry: Geometry
let animationFrameSequence = 0
let animationFrames = new Map<number, FrameRequestCallback>()

const flushAnimationFrames = () => {
  const pending = [...animationFrames.values()]
  animationFrames.clear()
  pending.forEach((callback) => callback(0))
}

const createEditor = () => {
  const editor = createPlateEditor({
    plugins: createPlateEditorPlugins(),
    value: [{ type: 'p', children: [{ text: '/head' }] }],
  })
  editor.selection = {
    anchor: { path: [0, 0], offset: 5 },
    focus: { path: [0, 0], offset: 5 },
  }
  const root = document.createElement('div')
  const text = document.createTextNode('/head')
  root.append(text)
  geometry = {
    container: text,
    rects: [{ bottom: 40, height: 20, left: 20, width: 1 }],
  }
  vi.spyOn(editor.api, 'toDOMNode').mockReturnValue(root)
  return editor
}

describe('usePlateSlashCommands anchor validation', () => {
  beforeEach(() => {
    animationFrameSequence = 0
    animationFrames = new Map()
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrameSequence += 1
      animationFrames.set(animationFrameSequence, callback)
      return animationFrameSequence
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frame) => {
      animationFrames.delete(frame)
    })
    vi.spyOn(window, 'getSelection').mockImplementation(
      () =>
        ({
          getRangeAt: () =>
            ({
              commonAncestorContainer: geometry.container,
              getClientRects: () => geometry.rects,
            }) as unknown as Range,
          rangeCount: 1,
        }) as unknown as Selection,
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(['scroll', 'resize'])('updates the menu anchor on %s', (eventName) => {
    const editor = createEditor()
    const { result } = renderHook(() =>
      usePlateSlashCommands({ documentIdentity: 'a.md', editor, labels }),
    )
    act(() => result.current.syncFromEditor())
    expect(result.current.menu.anchor).toEqual({ left: 20, top: 40 })

    geometry.rects = [{ bottom: 120, height: 20, left: 80, width: 1 }]
    act(() => window.dispatchEvent(new Event(eventName)))
    act(flushAnimationFrames)

    expect(result.current.menu.anchor).toEqual({ left: 80, top: 120 })
  })

  it('coalesces scroll and resize geometry reads into one animation frame', () => {
    const editor = createEditor()
    const { result } = renderHook(() =>
      usePlateSlashCommands({ documentIdentity: 'a.md', editor, labels }),
    )
    act(() => result.current.syncFromEditor())
    vi.mocked(window.requestAnimationFrame).mockClear()
    geometry.rects = [{ bottom: 120, height: 20, left: 80, width: 1 }]

    act(() => {
      window.dispatchEvent(new Event('scroll'))
      window.dispatchEvent(new Event('resize'))
      window.dispatchEvent(new Event('scroll'))
    })

    expect(window.requestAnimationFrame).toHaveBeenCalledOnce()
    expect(result.current.menu.anchor).toEqual({ left: 20, top: 40 })
    act(flushAnimationFrames)
    expect(result.current.menu.anchor).toEqual({ left: 80, top: 120 })
  })

  it('cancels a queued geometry read when the menu unmounts', () => {
    const editor = createEditor()
    const { result, unmount } = renderHook(() =>
      usePlateSlashCommands({ documentIdentity: 'a.md', editor, labels }),
    )
    act(() => result.current.syncFromEditor())
    act(() => window.dispatchEvent(new Event('scroll')))

    unmount()

    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(1)
    expect(animationFrames.size).toBe(0)
  })

  it('does not open when the browser selection belongs to another surface', () => {
    const editor = createEditor()
    geometry.container = document.createTextNode('external')
    const { result } = renderHook(() =>
      usePlateSlashCommands({ documentIdentity: 'a.md', editor, labels }),
    )

    act(() => result.current.syncFromEditor())

    expect(result.current.menu.open).toBe(false)
  })

  it.each([
    ['has no client rects', []],
    ['has no real geometry', [{ bottom: 0, height: 0, left: 0, width: 0 }]],
  ])('does not open when the caret range %s', (_, rects) => {
    const editor = createEditor()
    geometry.rects = rects
    const { result } = renderHook(() =>
      usePlateSlashCommands({ documentIdentity: 'a.md', editor, labels }),
    )

    act(() => result.current.syncFromEditor())

    expect(result.current.menu.open).toBe(false)
  })

  it('does not open when no selection is available', () => {
    const editor = createEditor()
    vi.mocked(window.getSelection).mockReturnValue(null)
    const { result } = renderHook(() =>
      usePlateSlashCommands({ documentIdentity: 'a.md', editor, labels }),
    )

    act(() => result.current.syncFromEditor())

    expect(result.current.menu.open).toBe(false)
  })
})
