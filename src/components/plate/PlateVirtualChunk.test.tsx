import { act, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  renderPlateEditorChunk,
  renderReadOnlyPlateEditorChunk,
} from '@/components/plate/plateEditorConfig'

type ObserverCallback = ConstructorParameters<typeof IntersectionObserver>[0]

let observerCallback: ObserverCallback | null = null

class MockIntersectionObserver {
  constructor(callback: ObserverCallback) {
    observerCallback = callback
  }

  disconnect = vi.fn()
  observe = vi.fn()
  unobserve = vi.fn()
  takeRecords = vi.fn(() => [])
  root = null
  rootMargin = '900px 0px'
  thresholds = [0]
}

const emitIntersection = (target: Element, isIntersecting: boolean, height = 640) => {
  observerCallback?.(
    [
      {
        boundingClientRect: { height },
        intersectionRatio: isIntersecting ? 1 : 0,
        isIntersecting,
        target,
      } as IntersectionObserverEntry,
    ],
    {} as IntersectionObserver,
  )
}

describe('Plate read-only chunk virtualization', () => {
  beforeEach(() => {
    observerCallback = null
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('recycles an offscreen read-only chunk while retaining its measured height', () => {
    const chunk = renderReadOnlyPlateEditorChunk({
      attributes: { 'data-slate-chunk': true },
      children: createElement('p', null, 'Offscreen text'),
      highest: true,
      lowest: true,
    })
    const { container } = render(chunk)
    const wrapper = container.querySelector<HTMLElement>('[data-slate-chunk="true"]')!

    expect(screen.getByText('Offscreen text')).toBeInTheDocument()

    act(() => emitIntersection(wrapper, false, 640))

    expect(screen.queryByText('Offscreen text')).not.toBeInTheDocument()
    expect(wrapper).toHaveAttribute('data-plate-virtual-state', 'recycled')
    expect(wrapper.style.height).toBe('640px')
    expect(wrapper.style.containIntrinsicBlockSize).toBe('auto 800px')
  })

  it('remounts recycled children when their placeholder enters overscan', () => {
    const chunk = renderReadOnlyPlateEditorChunk({
      attributes: { 'data-slate-chunk': true },
      children: createElement('p', null, 'Return text'),
      highest: true,
      lowest: true,
    })
    const { container } = render(chunk)
    const wrapper = container.querySelector<HTMLElement>('[data-slate-chunk="true"]')!

    act(() => emitIntersection(wrapper, false, 512))
    act(() => emitIntersection(wrapper, true, 512))

    expect(screen.getByText('Return text')).toBeInTheDocument()
    expect(wrapper).toHaveAttribute('data-plate-virtual-state', 'mounted')
    expect(wrapper.style.height).toBe('')
  })

  it('remounts recycled children before a read-only editor receives selection or copy input', () => {
    const chunk = renderReadOnlyPlateEditorChunk({
      attributes: { 'data-slate-chunk': true },
      children: createElement('p', null, 'Selectable text'),
      highest: true,
      lowest: true,
    })
    const { container } = render(
      createElement('div', { 'data-slate-editor': true, tabIndex: 0 }, chunk),
    )
    const editor = container.querySelector<HTMLElement>('[data-slate-editor="true"]')!
    const wrapper = container.querySelector<HTMLElement>('[data-slate-chunk="true"]')!

    act(() => emitIntersection(wrapper, false, 480))
    expect(screen.queryByText('Selectable text')).not.toBeInTheDocument()

    act(() => editor.focus())

    expect(screen.getByText('Selectable text')).toBeInTheDocument()
    expect(wrapper).toHaveAttribute('data-plate-virtual-state', 'mounted')
  })

  it('remeasures a focused chunk before recycling it after blur', () => {
    vi.useFakeTimers()
    const chunk = renderReadOnlyPlateEditorChunk({
      attributes: { 'data-slate-chunk': true },
      children: createElement('p', null, 'Resizable text'),
      highest: true,
      lowest: true,
    })
    const { container } = render(
      createElement(
        'div',
        null,
        createElement('div', { 'data-slate-editor': true, tabIndex: 0 }, chunk),
        createElement('button', null, 'Outside'),
      ),
    )
    const editor = container.querySelector<HTMLElement>('[data-slate-editor="true"]')!
    const wrapper = container.querySelector<HTMLElement>('[data-slate-chunk="true"]')!

    act(() => emitIntersection(wrapper, false, 480))
    act(() => editor.focus())
    vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue({
      height: 720,
    } as DOMRect)
    act(() => screen.getByRole('button', { name: 'Outside' }).focus())
    act(() => vi.runAllTimers())

    expect(wrapper).toHaveAttribute('data-plate-virtual-state', 'recycled')
    expect(wrapper.style.height).toBe('720px')
    vi.useRealTimers()
  })

  it('never recycles editable chunks so Slate DOM mappings remain intact', () => {
    const chunk = renderPlateEditorChunk({
      attributes: { 'data-slate-chunk': true },
      children: createElement('p', null, 'Editable text'),
      highest: true,
      lowest: true,
    })
    const { container } = render(chunk)

    expect(screen.getByText('Editable text')).toBeInTheDocument()
    expect(container.querySelector('[data-plate-virtual-state]')).not.toBeInTheDocument()
    expect(observerCallback).toBeNull()
  })
})
