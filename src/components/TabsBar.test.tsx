import type { ComponentProps } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import TabsBar from '@/components/TabsBar'
import i18n from '@/i18n/setup'
import { getWorkspaceTabId } from '@/logic/tabs'
import { usePreferencesStore } from '@/store/usePreferencesStore'

type TabsBarTestProps = ComponentProps<typeof TabsBar>

const currentTab = { kind: 'file' as const, view: 'source' as const, path: 'notes/current.md' }

const createProps = (): TabsBarTestProps => ({
  tabs: [currentTab],
  dirtyPaths: {},
  saveStates: {},
  activeTabId: getWorkspaceTabId(currentTab),
  onOpenTab: vi.fn(),
  onCloseTab: vi.fn(),
  silentSave: true,
})

const renderTabsBar = (overrides: Partial<TabsBarTestProps> = {}) => {
  const props = { ...createProps(), ...overrides }
  render(<TabsBar {...props} />)
  return props
}

const openFromHover = () => {
  fireEvent.pointerEnter(screen.getByTestId('tabs-dock'))
  act(() => vi.advanceTimersByTime(200))
}

beforeEach(async () => {
  localStorage.clear()
  vi.clearAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(720)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(32)
  usePreferencesStore.setState({ locale: 'en-US' })
  await i18n.changeLanguage('en-US')
})

afterEach(() => vi.useRealTimers())

describe('TabsBar immersive dock', () => {
  it('keeps only the active-file handle visible while collapsed', () => {
    renderTabsBar()

    expect(screen.getByRole('button', { name: /Show open files.*current · Source/ })).toBeVisible()
    expect(screen.queryByRole('tablist', { name: 'Open files' })).not.toBeInTheDocument()
  })

  it('opens on hover and closes after the pointer leaves', () => {
    renderTabsBar()

    openFromHover()
    expect(screen.getByRole('tablist', { name: 'Open files' })).toBeVisible()
    screen.getByRole('tab').focus()

    fireEvent.pointerLeave(screen.getByTestId('tabs-dock'))
    act(() => vi.advanceTimersByTime(250))

    expect(screen.queryByRole('tablist', { name: 'Open files' })).not.toBeInTheDocument()
  })

  it('cancels a pending hover close when the pointer returns', () => {
    renderTabsBar()
    openFromHover()

    fireEvent.pointerLeave(screen.getByTestId('tabs-dock'))
    act(() => vi.advanceTimersByTime(100))
    fireEvent.pointerEnter(screen.getByTestId('tabs-dock'))
    act(() => vi.advanceTimersByTime(150))

    expect(screen.getByRole('tablist', { name: 'Open files' })).toBeVisible()
  })

  it('can stay pinned after hover until explicitly collapsed', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderTabsBar()
    openFromHover()

    await user.click(screen.getByRole('button', { name: 'Keep tabs open' }))
    fireEvent.pointerLeave(screen.getByTestId('tabs-dock'))
    act(() => vi.advanceTimersByTime(250))

    expect(screen.getByRole('tablist', { name: 'Open files' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Collapse tabs' }))
    expect(screen.queryByRole('tablist', { name: 'Open files' })).not.toBeInTheDocument()
  })

  it('uses a horizontally virtualized track for many open files', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const tabs = Array.from({ length: 20 }, (_, index) => ({
      kind: 'file' as const,
      view: 'edit' as const,
      path: `notes/note-${index}.md`,
    }))
    renderTabsBar({ tabs, activeTabId: getWorkspaceTabId(tabs[0]) })

    await user.click(screen.getByRole('button', { name: /Show open files/ }))

    expect(screen.getByTestId('virtual-tabs-track')).toHaveStyle({ width: '2720px' })
    expect(screen.getAllByRole('tab').length).toBeLessThan(tabs.length)
  })

  it('keeps tab state, close controls, and keyboard navigation accessible', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const nextTab = { kind: 'file' as const, view: 'preview' as const, path: 'notes/next.md' }
    const props = renderTabsBar({
      tabs: [currentTab, nextTab],
      silentSave: false,
      dirtyPaths: { 'notes/current.md': true },
      saveStates: { 'notes/current.md': { status: 'saving' } },
    })
    await user.click(screen.getByRole('button', { name: /Show open files/ }))

    const activeTab = screen.getByRole('tab', { name: /current · Source.*Unsaved/ })
    expect(activeTab).toHaveAttribute('aria-selected', 'true')
    activeTab.focus()
    await user.keyboard('{ArrowRight}')
    expect(props.onOpenTab).toHaveBeenCalledWith(getWorkspaceTabId(nextTab))

    await user.click(screen.getByRole('button', { name: /Close tab.*current · Source/i }))
    expect(props.onCloseTab).toHaveBeenCalledWith(getWorkspaceTabId(currentTab))
  })

  it('does not render a dock when no documents are open', () => {
    renderTabsBar({ tabs: [], activeTabId: null })

    expect(screen.queryByTestId('tabs-dock')).not.toBeInTheDocument()
  })
})
