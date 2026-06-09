import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TabsBar from '@/components/TabsBar'
import i18n from '@/i18n/setup'
import { usePreferencesStore } from '@/store/usePreferencesStore'

const createProps = () => ({
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

beforeEach(async () => {
  localStorage.clear()
  usePreferencesStore.setState({ locale: 'en-US' })
  await i18n.changeLanguage('en-US')
})

describe('TabsBar', () => {
  it('shows a compact unsaved indicator when visible save state is enabled', () => {
    render(
      <TabsBar
        {...createProps()}
        silentSave={false}
        dirtyPaths={{ 'notes/current.md': true }}
        saveStates={{ 'notes/current.md': { status: 'saving' } }}
      />,
    )

    expect(screen.getByLabelText('Unsaved')).toBeInTheDocument()
    expect(screen.queryByText('Saving')).not.toBeInTheDocument()
  })

  it('hides routine save state when silent save is enabled', () => {
    render(
      <TabsBar
        {...createProps()}
        dirtyPaths={{ 'notes/current.md': true }}
        saveStates={{ 'notes/current.md': { status: 'saving' } }}
      />,
    )

    expect(screen.queryByText('Saving')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Unsaved')).not.toBeInTheDocument()
  })

  it('still shows compact save errors when silent save is enabled', () => {
    render(
      <TabsBar
        {...createProps()}
        dirtyPaths={{ 'notes/current.md': true }}
        saveStates={{ 'notes/current.md': { status: 'error' } }}
      />,
    )

    expect(screen.getByLabelText('Save failed')).toBeInTheDocument()
  })
})
