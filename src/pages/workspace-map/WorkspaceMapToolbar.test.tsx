import { createEvent, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceMapToolbar } from '@/pages/workspace-map/WorkspaceMapToolbar'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

describe('WorkspaceMapToolbar', () => {
  it('switches map modes and exposes explicit automatic arrangement', () => {
    const onArrange = vi.fn()
    const onModeChange = vi.fn()
    render(
      <WorkspaceMapToolbar
        externalCount={0}
        mode="overview"
        nodes={[]}
        onArrange={onArrange}
        onFocusNode={vi.fn()}
        onModeChange={onModeChange}
        onSearchOpenChange={vi.fn()}
        onToggleExternalResources={vi.fn()}
        searchOpen={false}
        showExternalResources={false}
      />,
    )

    expect(screen.getByRole('button', { name: 'workspaceMap.overviewMode' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.click(screen.getByRole('button', { name: 'workspaceMap.focusMode' }))
    fireEvent.click(screen.getByRole('button', { name: 'workspaceMap.autoArrange' }))

    expect(onModeChange).toHaveBeenCalledExactlyOnceWith('focus')
    expect(onArrange).toHaveBeenCalledOnce()
  })

  it('exposes one keyboard tab stop and supports arrow-key toolbar navigation', async () => {
    const user = userEvent.setup()
    render(
      <WorkspaceMapToolbar
        externalCount={0}
        mode="overview"
        nodes={[]}
        onArrange={vi.fn()}
        onFocusNode={vi.fn()}
        onModeChange={vi.fn()}
        onSearchOpenChange={vi.fn()}
        onToggleExternalResources={vi.fn()}
        searchOpen={false}
        showExternalResources={false}
      />,
    )
    const toolbar = screen.getByRole('toolbar', { name: 'workspaceMap.toolbar' })
    const search = screen.getByRole('button', { name: 'workspaceMap.searchNodes' })
    const focus = screen.getByRole('button', { name: 'workspaceMap.focusMode' })

    expect(toolbar).toBeVisible()
    expect(search).toHaveAttribute('tabindex', '0')
    expect(focus).toHaveAttribute('tabindex', '-1')
    search.focus()
    await user.keyboard('{ArrowRight}')
    expect(focus).toHaveFocus()
    expect(focus).toHaveAttribute('tabindex', '0')
    expect(search).toHaveAttribute('tabindex', '-1')
  })

  it('does not steal focus when optional toolbar items change', () => {
    const props = {
      mode: 'overview' as const,
      nodes: [],
      onArrange: vi.fn(),
      onFocusNode: vi.fn(),
      onModeChange: vi.fn(),
      onSearchOpenChange: vi.fn(),
      onToggleExternalResources: vi.fn(),
      searchOpen: false,
      showExternalResources: false,
    }
    const view = render(
      <>
        <button type="button">Outside</button>
        <WorkspaceMapToolbar {...props} externalCount={0} />
      </>,
    )
    const outside = screen.getByRole('button', { name: 'Outside' })
    outside.focus()

    view.rerender(
      <>
        <button type="button">Outside</button>
        <WorkspaceMapToolbar {...props} externalCount={2} />
      </>,
    )

    expect(outside).toHaveFocus()
  })

  it.each([
    ['Control', { ctrlKey: true }],
    ['Meta', { metaKey: true }],
  ])('reclaims repeated %s+F from any node-search control', (_name, mod) => {
    render(
      <WorkspaceMapToolbar
        externalCount={0}
        mode="overview"
        nodes={[
          {
            data: { label: 'Alpha', path: 'notes/alpha.md' },
            id: 'file:notes/alpha.md',
            position: { x: 0, y: 0 },
            type: 'file',
          },
        ]}
        onArrange={vi.fn()}
        onFocusNode={vi.fn()}
        onModeChange={vi.fn()}
        onSearchOpenChange={vi.fn()}
        onToggleExternalResources={vi.fn()}
        searchOpen
        showExternalResources={false}
      />,
    )
    const input = screen.getByRole<HTMLInputElement>('combobox', {
      name: 'workspaceMap.searchNodes',
    })
    fireEvent.change(input, { target: { value: 'alp' } })
    input.setSelectionRange(3, 3)
    const result = screen.getByRole('option', { name: /Alpha/ })
    result.focus()
    const repeatedFind = createEvent.keyDown(result, { ...mod, key: 'f' })

    fireEvent(result, repeatedFind)

    expect(repeatedFind.defaultPrevented).toBe(true)
    expect(input).toHaveFocus()
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(input.value.length)
  })
})
