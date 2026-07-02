import type { ComponentProps } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TabsBar from '@/components/TabsBar'
import i18n from '@/i18n/setup'
import { getWorkspaceTabId } from '@/logic/tabs'
import { usePreferencesStore } from '@/store/usePreferencesStore'

type TabsBarTestProps = ComponentProps<typeof TabsBar>

const createProps = (): TabsBarTestProps => ({
  tabs: [{ kind: 'file' as const, view: 'source' as const, path: 'notes/current.md' }],
  dirtyPaths: {},
  saveStates: {},
  activeTabId: 'file:source:notes/current.md',
  onOpenTab: vi.fn(),
  onCloseTab: vi.fn(),
  viewMode: 'source' as const,
  onChangeView: vi.fn(),
  silentSave: true,
})

const renderTabsBar = (overrides: Partial<TabsBarTestProps> = {}) => {
  const props = { ...createProps(), ...overrides }

  render(<TabsBar {...props} />)

  return props
}

beforeEach(async () => {
  localStorage.clear()
  vi.clearAllMocks()
  usePreferencesStore.setState({ locale: 'en-US' })
  await i18n.changeLanguage('en-US')
})

describe('TabsBar', () => {
  it('shows a compact unsaved indicator when visible save state is enabled', () => {
    renderTabsBar({
      silentSave: false,
      dirtyPaths: { 'notes/current.md': true },
      saveStates: { 'notes/current.md': { status: 'saving' } },
    })

    expect(screen.getByLabelText('Unsaved')).toBeInTheDocument()
    expect(screen.queryByText('Saving')).not.toBeInTheDocument()
  })

  it('hides routine save state when silent save is enabled', () => {
    renderTabsBar({
      dirtyPaths: { 'notes/current.md': true },
      saveStates: { 'notes/current.md': { status: 'saving' } },
    })

    expect(screen.queryByText('Saving')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Unsaved')).not.toBeInTheDocument()
  })

  it('still shows compact save errors when silent save is enabled', () => {
    renderTabsBar({
      dirtyPaths: { 'notes/current.md': true },
      saveStates: { 'notes/current.md': { status: 'error' } },
    })

    expect(screen.getByLabelText('Save failed')).toBeInTheDocument()
  })

  it('names tab state and close controls with file context', async () => {
    const user = userEvent.setup()
    const props = renderTabsBar({
      silentSave: false,
      dirtyPaths: { 'notes/current.md': true },
      saveStates: { 'notes/current.md': { status: 'saving' } },
    })

    expect(screen.getByRole('tab', { name: /current · Source.*Unsaved/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    const closeButton = screen.getByRole('button', { name: /current · Source/ })

    expect(closeButton).toHaveAttribute('title', expect.stringContaining('current · Source'))

    await user.click(closeButton)

    expect(props.onCloseTab).toHaveBeenCalledWith('file:source:notes/current.md')
    expect(props.onOpenTab).not.toHaveBeenCalled()
  })

  it('opens adjacent tabs with tablist arrow navigation', async () => {
    const user = userEvent.setup()
    const nextTab = { kind: 'file' as const, view: 'preview' as const, path: 'notes/next.md' }
    const props = renderTabsBar({
      tabs: [{ kind: 'file' as const, view: 'source' as const, path: 'notes/current.md' }, nextTab],
    })

    screen.getByRole('tab', { name: 'current · Source' }).focus()

    await user.keyboard('{ArrowRight}')

    expect(screen.getByRole('tab', { name: 'next · Preview' })).toHaveFocus()
    expect(props.onOpenTab).toHaveBeenCalledWith(getWorkspaceTabId(nextTab))
  })

  it('exposes pressed state on view mode controls', () => {
    renderTabsBar({ viewMode: 'source' })

    expect(screen.getByRole('button', { name: 'Source' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'WYSIWYG' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Mind Map' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('disables view mode controls when no editable file tab is active', () => {
    const workspaceGraphTab = { kind: 'workspace-graph' as const }

    renderTabsBar({
      tabs: [workspaceGraphTab],
      activeTabId: getWorkspaceTabId(workspaceGraphTab),
    })

    expect(screen.getByRole('button', { name: 'Source' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'WYSIWYG' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Mind Map' })).toBeDisabled()
  })
})
