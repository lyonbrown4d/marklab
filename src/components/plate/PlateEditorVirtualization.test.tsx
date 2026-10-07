import { act, render } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PlateEditorSurface,
  type PlateEditorSurfaceHandle,
} from '@/components/plate/PlateEditorSurface'

type ObserverCallback = ConstructorParameters<typeof IntersectionObserver>[0]

let callbacks: ObserverCallback[] = []

class MockIntersectionObserver {
  constructor(callback: ObserverCallback) {
    callbacks.push(callback)
  }

  disconnect = vi.fn()
  observe = vi.fn()
  unobserve = vi.fn()
  takeRecords = vi.fn(() => [])
  root = null
  rootMargin = '900px 0px'
  thresholds = [0]
}

const longMarkdown = Array.from({ length: 45 }, (_, index) => `Paragraph ${index}`).join('\n\n')

describe('PlateEditorSurface virtualization boundary', () => {
  beforeEach(() => {
    callbacks = []
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
})
