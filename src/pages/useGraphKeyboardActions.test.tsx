import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createPortal } from 'react-dom'
import { useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphData } from '@/logic/graph'
import type { ShortcutBindings } from '@/logic/shortcuts'
import { useGraphKeyboardActions } from '@/pages/useGraphKeyboardActions'

const preferences = vi.hoisted(() => ({ shortcutOverrides: {} as ShortcutBindings }))
vi.mock('@/store/usePreferencesStore', () => ({
  usePreferencesStore: (selector: (state: typeof preferences) => unknown) => selector(preferences),
}))

const heading = (id: string, line: number): GraphData['nodes'][number] => ({
  id,
  type: 'heading',
  position: { x: 0, y: 0 },
  data: { label: id, line },
})
const contains = (source: string, target: string) => ({
  id: source + target,
  source,
  target,
  data: { kind: 'contains' },
})
const initialGraph: GraphData = {
  nodes: [heading('root', 1), heading('child', 2), heading('last', 3)],
  edges: [contains('root', 'child')],
}
type HarnessProps = {
  editable?: boolean
  initialSelection?: string | null
  add?: (id: string) => string | null
}
const Harness = ({
  editable = true,
  initialSelection = 'root',
  add = () => 'new',
}: HarnessProps) => {
  const graphShellRef = useRef<HTMLDivElement>(null)
  const [graph, setGraph] = useState(initialGraph)
  const [selected, selectHeading] = useState(initialSelection)
  const append = (id: string, child: boolean) => {
    const next = add(id)
    if (next)
      setGraph((current) => ({
        nodes: [...current.nodes, heading(next, 4)],
        edges: child ? [...current.edges, contains(id, next)] : current.edges,
      }))
    return next
  }
  const { visibleNodes, handleGraphMouseDown } = useGraphKeyboardActions({
    editable,
    ...graph,
    flowInstance: null,
    graphShellRef,
    selectedHeadingId: selected,
    clearSelection: () => selectHeading(null),
    selectHeading,
    onAddChildHeading: (id) => append(id, true),
    onAddSiblingHeading: (id) => append(id, false),
    onAddSiblingHeadingBefore: (id) => append(id, false),
    onDeleteHeading: () => null,
  })
  return (
    <div ref={graphShellRef} tabIndex={0} data-testid="graph" onMouseDown={handleGraphMouseDown}>
      <output data-testid="selection">{selected ?? 'none'}</output>
      {visibleNodes.map((node) => (
        <div key={node.id} className="react-flow__node" role="button" tabIndex={0}>
          <div data-graph-node-id={node.id} data-testid={node.id}>
            <div
              contentEditable={editable}
              suppressContentEditableWarning
              data-markdown-block-role="title"
            >
              {node.data.label}
            </div>
          </div>
        </div>
      ))}
      <button type="button" data-testid="button">
        <svg data-testid="icon" />
      </button>
      <input data-testid="input" />
      <div role="dialog" tabIndex={-1} data-testid="dialog">
        Dialog
      </div>
      {createPortal(
        <div role="dialog" tabIndex={-1} data-testid="portal">
          Portal
        </div>,
        document.body,
      )}
    </div>
  )
}
const press = (key: string, target = screen.getByTestId('graph'), init: KeyboardEventInit = {}) => {
  const unhandled = fireEvent.keyDown(target, { key, ...init })
  fireEvent.keyUp(target, { key, ...init })
  return unhandled
}
beforeEach(() => {
  preferences.shortcutOverrides = {}
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('graph keyboard actions', () => {
  it('expands a collapsed parent before editing its new child', () => {
    const add = vi.fn(() => 'new')
    render(<Harness add={add} />)
    screen.getByTestId('graph').focus()
    press('[')
    expect(screen.queryByTestId('child')).not.toBeInTheDocument()
    press('Tab')
    expect(add).toHaveBeenCalledExactlyOnceWith('root')
    expect(screen.getByTestId('selection')).toHaveTextContent('new')
    expect(screen.getByTestId('new')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(64))
    expect(document.activeElement).toHaveTextContent('new')
    expect(window.getSelection()?.toString()).toBe('new')
  })

  it('keeps the selection at navigation boundaries', () => {
    render(<Harness />)
    press('ArrowLeft')
    expect(screen.getByTestId('selection')).toHaveTextContent('root')
    press('ArrowUp')
    expect(screen.getByTestId('selection')).toHaveTextContent('root')
  })

  it.each([
    ['Enter', false],
    ['Enter', true],
    ['Tab', false],
  ] as const)('creates and immediately edits with %s (shift=%s)', (key, shiftKey) => {
    const add = vi.fn(() => 'new')
    render(<Harness add={add} />)
    screen.getByTestId('graph').focus()
    expect(press(key, undefined, { shiftKey })).toBe(false)
    expect(add).toHaveBeenCalledExactlyOnceWith('root')
    act(() => vi.advanceTimersByTime(64))
    expect(document.activeElement).toHaveTextContent('new')
    expect(window.getSelection()?.toString()).toBe('new')
  })

  it('expands on right arrow and then navigates to the first child', () => {
    render(<Harness />)
    press('[')
    press('ArrowRight')
    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.getByTestId('selection')).toHaveTextContent('root')
    press('ArrowRight')
    expect(screen.getByTestId('selection')).toHaveTextContent('child')
    press('ArrowLeft')
    expect(screen.getByTestId('selection')).toHaveTextContent('root')
  })

  it('skips collapsed descendants and stays at the final heading', () => {
    render(<Harness />)
    press('[')
    press('ArrowDown')
    expect(screen.getByTestId('selection')).toHaveTextContent('last')
    press('ArrowDown')
    press('ArrowRight')
    expect(screen.getByTestId('selection')).toHaveTextContent('last')
  })

  it.each([
    ['ArrowDown', 'root'],
    ['ArrowUp', 'last'],
  ] as const)('starts selection with %s', (key, expected) => {
    render(<Harness initialSelection={null} />)
    press(key)
    expect(screen.getByTestId('selection')).toHaveTextContent(expected)
  })

  it.each(['button', 'icon', 'input', 'dialog', 'portal'])(
    'does not hijack keyboard or mouse events from %s',
    (id) => {
      const add = vi.fn(() => 'new')
      render(<Harness add={add} />)
      const input = screen.getByTestId('input')
      input.focus()
      const target = screen.getByTestId(id)
      fireEvent.mouseDown(target)
      expect(input).toHaveFocus()
      expect(press('Enter', target)).toBe(true)
      expect(press('Tab', target)).toBe(true)
      expect(press('ArrowDown', target)).toBe(true)
      expect(add).not.toHaveBeenCalled()
      expect(screen.getByTestId('selection')).toHaveTextContent('root')
    },
  )

  it('leaves editable title typing and IME confirmation alone', () => {
    const add = vi.fn(() => 'new')
    render(<Harness add={add} />)
    const title = screen.getByTestId('root').firstElementChild as HTMLElement
    title.focus()
    expect(press('Enter', title)).toBe(true)
    expect(press('Tab', title)).toBe(true)
    expect(press('Enter', undefined, { isComposing: true })).toBe(true)
    expect(press('Enter', undefined, { keyCode: 229 })).toBe(true)
    expect(add).not.toHaveBeenCalled()
    expect(title).toHaveFocus()
  })

  it('handles canvas events inside the React Flow node button wrapper', () => {
    const add = vi.fn(() => 'new')
    render(<Harness add={add} />)
    fireEvent.mouseDown(screen.getByTestId('root'))
    expect(screen.getByTestId('graph')).toHaveFocus()
    press('Enter', screen.getByTestId('root'))
    expect(add).toHaveBeenCalledExactlyOnceWith('root')
  })

  it('preserves selection and collapse when a Markdown mutation is rejected', () => {
    render(<Harness add={() => null} />)
    press('[')
    press('Tab')
    press('Enter')
    expect(screen.getByTestId('selection')).toHaveTextContent('root')
    expect(screen.queryByTestId('child')).not.toBeInTheDocument()
  })

  it('does not mutate read-only graphs', () => {
    const add = vi.fn(() => 'new')
    render(<Harness editable={false} add={add} />)
    expect(press('Enter')).toBe(true)
    expect(press('Tab')).toBe(true)
    expect(add).not.toHaveBeenCalled()
    press('ArrowDown')
    expect(screen.getByTestId('selection')).toHaveTextContent('child')
  })

  it('uses configured bindings rather than hardcoding Enter', () => {
    preferences.shortcutOverrides = { 'graph.addSibling': ['Control+Enter'] }
    const add = vi.fn(() => 'new')
    render(<Harness add={add} />)
    press('Enter')
    expect(add).not.toHaveBeenCalled()
    press('Enter', undefined, { ctrlKey: true })
    expect(add).toHaveBeenCalledExactlyOnceWith('root')
  })
})
