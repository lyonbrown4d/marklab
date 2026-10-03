import { StrictMode, useEffect, useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useDrag, useDragDropManager, useDrop } from 'react-dnd'
import { describe, expect, it, vi } from 'vitest'
import { PlateDndProvider } from '@/components/plate/PlateDndProvider'

type DragDropManager = ReturnType<typeof useDragDropManager>

type BackendWindow = Window & {
  __isReactDndBackendSetUp?: boolean
}

type EditorProbeProps = {
  label: string
  onManager: (manager: DragDropManager) => void
}

const EditorProbe = ({ label, onManager }: EditorProbeProps) => {
  const manager = useDragDropManager()
  const [, connectDrag] = useDrag(() => ({ item: { label }, type: 'plate-test' }), [label])
  const [, connectDrop] = useDrop(() => ({ accept: 'plate-test' }))

  useEffect(() => {
    onManager(manager)
  }, [manager, onManager])

  return (
    <div
      ref={(element) => {
        connectDrop(element)
      }}
    >
      <div
        ref={(element) => {
          connectDrag(element)
        }}
      >
        {label}
      </div>
    </div>
  )
}

const DelayedEditorHarness = ({ onManager }: Pick<EditorProbeProps, 'onManager'>) => {
  const [secondEditorOpen, setSecondEditorOpen] = useState(false)

  return (
    <>
      <PlateDndProvider>
        <EditorProbe label="First editor" onManager={onManager} />
      </PlateDndProvider>
      <button type="button" onClick={() => setSecondEditorOpen(true)}>
        Open second editor
      </button>
      {secondEditorOpen && (
        <PlateDndProvider>
          <EditorProbe label="Second editor" onManager={onManager} />
        </PlateDndProvider>
      )}
    </>
  )
}

describe('PlateDndProvider', () => {
  it('reuses and tears down one real HTML5 backend when another editor mounts later', async () => {
    const managers = new Set<DragDropManager>()
    const recordManager = vi.fn((manager: DragDropManager) => {
      managers.add(manager)
    })
    const backendWindow = window as BackendWindow
    const user = userEvent.setup()
    const view = render(
      <StrictMode>
        <PlateDndProvider>
          <DelayedEditorHarness onManager={recordManager} />
        </PlateDndProvider>
      </StrictMode>,
    )

    expect(backendWindow.__isReactDndBackendSetUp).toBe(true)
    expect(managers).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Open second editor' }))
    expect(screen.getByText('Second editor')).toBeInTheDocument()
    expect(managers).toHaveLength(1)
    expect(backendWindow.__isReactDndBackendSetUp).toBe(true)

    view.unmount()
    expect(backendWindow.__isReactDndBackendSetUp).toBe(false)
  })
})
