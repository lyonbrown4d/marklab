import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphNodeDetails } from '@/logic/graphViewModel'
import { MindmapToolbar } from '@/pages/graph/MindmapToolbar'
import type { ShortcutBindings } from '@/logic/shortcuts'

const preferences = vi.hoisted(() => ({ shortcutOverrides: {} as ShortcutBindings }))
vi.mock('@/store/usePreferencesStore', () => ({
  usePreferencesStore: (selector: (state: typeof preferences) => unknown) => selector(preferences),
}))

const t = (key: string) => key
const details: GraphNodeDetails = {
  kind: 'heading',
  label: 'Topic',
  path: 'notes.md',
  openPath: 'notes.md',
  incoming: [],
  outgoing: [],
  node: {
    id: 'heading:topic',
    type: 'heading',
    position: { x: 0, y: 0 },
    data: { label: 'Topic', content: 'Markdown body with <script>literal text</script>' },
  },
}
const renderToolbar = (overrides: Partial<Parameters<typeof MindmapToolbar>[0]> = {}) => {
  const onContentModeChange = vi.fn()
  const onOpenPath = vi.fn()
  render(
    <MindmapToolbar
      contentMode="none"
      details={details}
      onContentModeChange={onContentModeChange}
      onOpenPath={onOpenPath}
      t={t}
      {...overrides}
    />,
  )
  return { onContentModeChange, onOpenPath }
}

describe('MindmapToolbar', () => {
  beforeEach(() => {
    preferences.shortcutOverrides = {}
  })

  it('shows actual overridden shortcuts only on demand for an editable heading', async () => {
    preferences.shortcutOverrides = {
      'graph.editTitle': ['F3'],
      'graph.addChild': ['F4'],
      'graph.addSibling': [],
    }
    const user = userEvent.setup()
    renderToolbar({ editable: true })
    expect(screen.queryByText('shortcuts.graphEditTitle')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'graph.inspectorTitle' }))
    expect(screen.getByText('F3')).toBeInTheDocument()
    expect(screen.getByText('F4')).toBeInTheDocument()
    expect(screen.queryByText('shortcuts.graphAddSibling')).not.toBeInTheDocument()
  })

  it('does not advertise editing shortcuts for a read-only graph', async () => {
    const user = userEvent.setup()
    renderToolbar({ editable: false })
    await user.click(screen.getByRole('button', { name: 'graph.inspectorTitle' }))
    expect(screen.queryByText('shortcuts.graphEditTitle')).not.toBeInTheDocument()
  })

  it('defaults to headings without a persistent inspector or graph filters', () => {
    renderToolbar()
    expect(screen.getByRole('radio', { name: 'graph.filterHeadings' })).toBeChecked()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByText('notes.md')).not.toBeInTheDocument()
  })

  it('switches body visibility explicitly and ignores deselecting the active mode', () => {
    const { onContentModeChange } = renderToolbar()
    fireEvent.click(screen.getByRole('radio', { name: 'graph.filterHeadings' }))
    expect(onContentModeChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('radio', { name: 'shortcuts.paragraph' }))
    expect(onContentModeChange).toHaveBeenCalledExactlyOnceWith('full')
  })

  it('can return to a title-only canvas', () => {
    const { onContentModeChange } = renderToolbar({ contentMode: 'full' })
    fireEvent.click(screen.getByRole('radio', { name: 'graph.filterHeadings' }))
    expect(onContentModeChange).toHaveBeenCalledExactlyOnceWith('none')
  })

  it('opens accessible details on demand and preserves literal Markdown content', async () => {
    const user = userEvent.setup()
    const { onOpenPath } = renderToolbar()
    const trigger = screen.getByRole('button', { name: 'graph.inspectorTitle' })
    await user.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Topic' })).toBeInTheDocument()
    expect(screen.getByText(details.node.data.content!)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'graph.openNode' }))
    expect(onOpenPath).toHaveBeenCalledExactlyOnceWith('notes.md')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('explains an empty selection only after the user opens details', async () => {
    const user = userEvent.setup()
    renderToolbar({ details: null })
    expect(screen.queryByText('graph.selectNodeDescription')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'graph.inspectorTitle' }))
    expect(screen.getByText('graph.selectNodeDescription')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'graph.openNode' })).not.toBeInTheDocument()
  })

  it('does not bubble toolbar input into canvas keyboard actions', () => {
    const onKeyDown = vi.fn()
    const onMouseDown = vi.fn()
    render(
      <div onKeyDown={onKeyDown} onMouseDown={onMouseDown}>
        <MindmapToolbar contentMode="none" details={null} onOpenPath={vi.fn()} t={t} />
      </div>,
    )
    const trigger = screen.getByRole('button', { name: 'graph.inspectorTitle' })
    fireEvent.keyDown(trigger, { key: 'Enter' })
    fireEvent.mouseDown(trigger)
    expect(onKeyDown).not.toHaveBeenCalled()
    expect(onMouseDown).not.toHaveBeenCalled()
  })
})
