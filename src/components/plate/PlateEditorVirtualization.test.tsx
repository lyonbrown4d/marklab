import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PlateEditorSurface,
  type PlateEditorSurfaceHandle,
} from '@/components/plate/PlateEditorSurface'

type ObserverCallback = ConstructorParameters<typeof IntersectionObserver>[0]

let callbacks: ObserverCallback[] = []
let observedChunks = new Map<Element, ObserverCallback>()

class MockIntersectionObserver {
  private readonly callback: ObserverCallback

  constructor(callback: ObserverCallback) {
    this.callback = callback
    callbacks.push(callback)
  }

  disconnect = vi.fn()
  observe = vi.fn((element: Element) => observedChunks.set(element, this.callback))
  unobserve = vi.fn()
  takeRecords = vi.fn(() => [])
  root = null
  rootMargin = '900px 0px'
  thresholds = [0]
}

const longMarkdown = Array.from({ length: 45 }, (_, index) => `Paragraph ${index}`).join('\n\n')
const longFindMarkdown = Array.from({ length: 45 }, (_, index) =>
  index === 44 ? `Needle paragraph ${index}` : `Paragraph ${index}`,
).join('\n\n')

const recycleChunk = (chunk: HTMLElement) => {
  const callback = observedChunks.get(chunk)
  if (!callback) throw new Error('Chunk observer was not registered')
  act(() => {
    callback(
      [
        {
          boundingClientRect: { height: 800 },
          intersectionRatio: 0,
          isIntersecting: false,
          target: chunk,
        } as unknown as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    )
  })
}

describe('PlateEditorSurface virtualization boundary', () => {
  beforeEach(() => {
    callbacks = []
    observedChunks = new Map()
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses recyclable chunks in read-only mode', () => {
    const { container } = render(
      <PlateEditorSurface
        activePath="notes/read.md"
        onChange={vi.fn()}
        placeholder="Read"
        readOnly
        value={longMarkdown}
      />,
    )

    expect(
      container.querySelectorAll('[data-plate-virtual-state="mounted"]').length,
    ).toBeGreaterThan(1)
    expect(callbacks.length).toBeGreaterThan(1)
  })

  it('keeps editable chunks mounted during selection and input', () => {
    const ref = createRef<PlateEditorSurfaceHandle>()
    const { container } = render(
      <PlateEditorSurface
        activePath="notes/edit.md"
        onChange={vi.fn()}
        placeholder="Write"
        ref={ref}
        value={longMarkdown}
      />,
    )
    const editor = ref.current?.getEditor()

    act(() => {
      editor?.tf.select({ path: [44, 0], offset: 4 })
      editor?.tf.insertText(' safe')
    })

    expect(editor?.api.string([44])).toBe('Para safegraph 44')
    expect(container.querySelector('[data-plate-virtual-state]')).not.toBeInTheDocument()
    expect(callbacks).toHaveLength(0)
  })

  it('reveals only the target chunk for the first offscreen read-only match', async () => {
    const ref = createRef<PlateEditorSurfaceHandle>()
    render(
      <PlateEditorSurface
        activePath="notes/find-long.md"
        onChange={vi.fn()}
        placeholder="Read"
        readOnly
        ref={ref}
        value={longFindMarkdown}
      />,
    )
    const editor = ref.current!.getEditor()
    const surface = screen.getByTestId('markdown-editor')
    fireEvent.keyDown(surface, { ctrlKey: true, key: 'f' })
    const query = screen.getByRole('searchbox', { name: 'Find in document' })
    const targetText = screen.getByText('Needle paragraph 44')
    const otherText = screen.getByText('Paragraph 0')
    const targetChunk = targetText.closest<HTMLElement>('[data-slate-chunk="true"]')!
    const otherChunk = otherText.closest<HTMLElement>('[data-slate-chunk="true"]')!
    expect(targetChunk).not.toBe(otherChunk)
    recycleChunk(targetChunk)
    recycleChunk(otherChunk)
    expect(targetChunk).toHaveAttribute('data-plate-virtual-state', 'recycled')
    expect(otherChunk).toHaveAttribute('data-plate-virtual-state', 'recycled')
    const resolveDOMPoint = editor.api.toDOMPoint.bind(editor.api)
    vi.spyOn(editor.api, 'toDOMPoint').mockImplementation((point) => {
      if (targetChunk.dataset.plateVirtualState === 'recycled') {
        throw new Error('Cannot resolve a DOM point inside a recycled chunk')
      }
      return resolveDOMPoint(point)
    })
    let targetMountedWhenScrolled = false
    const scrollIntoView = vi.spyOn(editor.api, 'scrollIntoView').mockImplementation(() => {
      targetMountedWhenScrolled =
        targetChunk.dataset.plateVirtualState === 'mounted' &&
        Boolean(targetChunk.querySelector('[data-block-id]'))
    })

    fireEvent.change(query, { target: { value: 'needle' } })

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ offset: 0, path: [44, 0] }))
    expect(targetMountedWhenScrolled).toBe(true)
    expect(targetChunk).toHaveAttribute('data-plate-virtual-state', 'mounted')
    expect(otherChunk).toHaveAttribute('data-plate-virtual-state', 'recycled')
    expect(query).toHaveFocus()
  })

  it('does not scroll when a recycled match has no registered chunk identity', async () => {
    const ref = createRef<PlateEditorSurfaceHandle>()
    render(
      <PlateEditorSurface
        activePath="notes/find-unknown-chunk.md"
        onChange={vi.fn()}
        placeholder="Read"
        readOnly
        ref={ref}
        value={longFindMarkdown}
      />,
    )
    const editor = ref.current!.getEditor()
    const surface = screen.getByTestId('markdown-editor')
    fireEvent.keyDown(surface, { ctrlKey: true, key: 'f' })
    const query = screen.getByRole('searchbox', { name: 'Find in document' })
    const targetChunk = screen
      .getByText('Needle paragraph 44')
      .closest<HTMLElement>('[data-slate-chunk="true"]')!
    recycleChunk(targetChunk)
    const targetBlock = editor.children[44] as unknown as { id: string }
    targetBlock.id = 'unregistered-block-id'
    const scrollIntoView = vi.spyOn(editor.api, 'scrollIntoView').mockImplementation(() => {
      throw new Error('scrollIntoView must not run without a revealed chunk')
    })

    fireEvent.change(query, { target: { value: 'needle' } })
    await act(
      () =>
        new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => resolve())
        }),
    )

    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(targetChunk).toHaveAttribute('data-plate-virtual-state', 'recycled')
    expect(query).toHaveFocus()
  })

  it('cancels a pending reveal when the query changes before its animation frame', () => {
    const ref = createRef<PlateEditorSurfaceHandle>()
    render(
      <PlateEditorSurface
        activePath="notes/find-cancelled.md"
        onChange={vi.fn()}
        placeholder="Read"
        readOnly
        ref={ref}
        value={longFindMarkdown}
      />,
    )
    const editor = ref.current!.getEditor()
    const surface = screen.getByTestId('markdown-editor')
    fireEvent.keyDown(surface, { ctrlKey: true, key: 'f' })
    const query = screen.getByRole('searchbox', { name: 'Find in document' })
    const targetChunk = screen
      .getByText('Needle paragraph 44')
      .closest<HTMLElement>('[data-slate-chunk="true"]')!
    recycleChunk(targetChunk)
    const frames = new Map<number, FrameRequestCallback>()
    let nextFrame = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      nextFrame += 1
      frames.set(nextFrame, callback)
      return nextFrame
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frame) => {
      frames.delete(frame)
    })
    const scrollIntoView = vi.spyOn(editor.api, 'scrollIntoView').mockImplementation(() => {})

    fireEvent.change(query, { target: { value: 'needle' } })
    expect(targetChunk).toHaveAttribute('data-plate-virtual-state', 'mounted')
    fireEvent.change(query, { target: { value: 'missing' } })
    act(() => {
      const pendingFrames = [...frames.values()]
      frames.clear()
      pendingFrames.forEach((callback) => callback(performance.now()))
    })

    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(targetChunk).toHaveAttribute('data-plate-virtual-state', 'recycled')
    expect(query).toHaveFocus()
  })
})
