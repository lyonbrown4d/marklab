import { act, render, screen } from '@testing-library/react'
import { createRef, type RefObject } from 'react'
import type {
  PlateSlashCommandLabels,
  PlateSlashCommandsController,
  PlateSlashUrlInsertionRequest,
} from '@/components/plate/slash'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlateEditorSurfaceHandle } from '@/components/plate/plateEditorSurfaceTypes'

const overlayControllers = new Map<string, PlateSlashCommandsController>()

vi.mock('@/components/plate/PlateEditorOverlays', () => ({
  PlateEditorOverlays: ({
    activePath,
    slash,
  }: {
    activePath: string | null
    slash: PlateSlashCommandsController
  }) => {
    if (activePath) overlayControllers.set(activePath, slash)
    return <div aria-label={`Formatting ${activePath}`} role="toolbar" />
  },
}))

import { PlateEditorSurface } from '@/components/plate/PlateEditorSurface'

const slashLabels = {} as PlateSlashCommandLabels

const SurfacePair = ({
  activePath,
  firstContentVisible = true,
  firstRef,
  firstValue = 'First',
}: {
  activePath: 'first.md' | 'second.md'
  firstContentVisible?: boolean
  firstRef?: RefObject<PlateEditorSurfaceHandle | null>
  firstValue?: string
}) => (
  <>
    <PlateEditorSurface
      activePath="first.md"
      contentVisible={firstContentVisible}
      interactionActive={activePath === 'first.md'}
      onChange={vi.fn()}
      placeholder="First editor"
      ref={firstRef}
      slashLabels={slashLabels}
      value={firstValue}
    />
    <PlateEditorSurface
      activePath="second.md"
      interactionActive={activePath === 'second.md'}
      onChange={vi.fn()}
      placeholder="Second editor"
      slashLabels={slashLabels}
      value="Second"
    />
  </>
)

describe('PlateEditorSurface overlay lifecycle', () => {
  beforeEach(() => overlayControllers.clear())

  it('mounts overlays only for the active surface and removes them immediately on tab switch', () => {
    const view = render(<SurfacePair activePath="first.md" />)

    expect(screen.getByRole('toolbar', { name: 'Formatting first.md' })).toBeInTheDocument()
    expect(screen.queryByRole('toolbar', { name: 'Formatting second.md' })).toBeNull()

    view.rerender(<SurfacePair activePath="second.md" />)

    expect(screen.queryByRole('toolbar', { name: 'Formatting first.md' })).toBeNull()
    expect(screen.getByRole('toolbar', { name: 'Formatting second.md' })).toBeInTheDocument()
  })

  it('keeps the active overlay link action guarded by the editor selection', () => {
    const ref = createRef<PlateEditorSurfaceHandle>()
    render(
      <PlateEditorSurface
        activePath="first.md"
        onChange={vi.fn()}
        placeholder="First editor"
        ref={ref}
        slashLabels={slashLabels}
        value="First"
      />,
    )
    const editor = ref.current!.getEditor()
    editor.tf.select(editor.api.range([])!)

    expect(ref.current?.openLinkDialog()).toBe(true)

    editor.selection = null
    expect(ref.current?.openLinkDialog()).toBe(false)
  })

  it('invalidates open slash UI when a cached editor becomes inactive', () => {
    const firstRef = createRef<PlateEditorSurfaceHandle>()
    const invalidate = vi.fn()
    const request = {
      insert: vi.fn(),
      invalidate,
      kind: 'link',
      restoreFocus: vi.fn(),
    } as unknown as PlateSlashUrlInsertionRequest
    const view = render(
      <SurfacePair activePath="first.md" firstRef={firstRef} firstValue="/head" />,
    )
    const firstController = overlayControllers.get('first.md')
    const firstEditor = firstRef.current?.getEditor()
    const firstSurface = screen.getByLabelText('First editor')
    const text = firstSurface.querySelector('[data-slate-string="true"]')?.firstChild
    expect(firstController).toBeDefined()
    expect(firstEditor).toBeDefined()
    expect(text).toBeInstanceOf(Text)
    const range = document.createRange()
    range.setStart(text!, 5)
    range.collapse(true)
    Object.defineProperty(range, 'getClientRects', {
      configurable: true,
      value: () => [{ bottom: 40, height: 20, left: 20, width: 1 }],
    })
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    const addWindowListener = vi.spyOn(window, 'addEventListener')
    const removeWindowListener = vi.spyOn(window, 'removeEventListener')

    act(() => {
      firstEditor?.tf.select({
        anchor: { offset: 5, path: [0, 0] },
        focus: { offset: 5, path: [0, 0] },
      })
      firstController?.syncFromEditor()
    })
    const activeController = overlayControllers.get('first.md')
    expect(activeController?.menu.open).toBe(true)
    const scrollListener = addWindowListener.mock.calls.find(([type]) => type === 'scroll')?.[1]
    expect(scrollListener).toBeTypeOf('function')

    act(() => activeController?.urlDialog.open(request))
    expect(overlayControllers.get('first.md')?.urlDialog.request).toBe(request)

    view.rerender(<SurfacePair activePath="second.md" firstRef={firstRef} firstValue="/head" />)

    expect(invalidate).toHaveBeenCalledOnce()
    expect(removeWindowListener).toHaveBeenCalledWith('scroll', scrollListener, true)

    view.rerender(<SurfacePair activePath="first.md" firstRef={firstRef} firstValue="/head" />)
    expect(screen.getByRole('toolbar', { name: 'Formatting first.md' })).toBeInTheDocument()
    expect(overlayControllers.get('first.md')?.urlDialog.request).toBeNull()
    expect(overlayControllers.get('first.md')?.menu.open).toBe(false)
  })

  it('does not restore a stale slash dialog after editor content is hidden and restored', () => {
    const invalidate = vi.fn()
    const request = {
      insert: vi.fn(),
      invalidate,
      kind: 'link',
      restoreFocus: vi.fn(),
    } as unknown as PlateSlashUrlInsertionRequest
    const view = render(<SurfacePair activePath="first.md" />)

    act(() => overlayControllers.get('first.md')?.urlDialog.open(request))
    expect(overlayControllers.get('first.md')?.urlDialog.request).toBe(request)

    view.rerender(<SurfacePair activePath="first.md" firstContentVisible={false} />)
    expect(invalidate).toHaveBeenCalledOnce()

    view.rerender(<SurfacePair activePath="first.md" />)
    expect(overlayControllers.get('first.md')?.urlDialog.request).toBeNull()
    expect(overlayControllers.get('first.md')?.menu.open).toBe(false)
  })
})
