import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n/setup'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { useVimModeStore, vimTabKey } from '@/store/useVimModeStore'
import { VimStatusBarControl } from '@/components/vim/VimStatusBarControl'
import { registerVimKeyboardScope, reportVimMode } from '@/components/vim/vimKeyboardScope'

const props = {
  workspaceKey: 'external:/notes',
  tabId: 'file:source:note.md',
  sourceEditor: true,
  readOnlyMode: false,
}

beforeEach(async () => {
  usePreferencesStore.setState({ vimModeEnabled: false, locale: 'en-US' })
  useVimModeStore.setState({ perTabOverrides: {} })
  await i18n.changeLanguage('en-US')
})

describe('VimStatusBarControl', () => {
  it('enables the current tab while the global default remains off and can follow global again', () => {
    render(<VimStatusBarControl {...props} />)
    expect(screen.getByText('Vim: Off')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Vim mode settings' }))
    const currentTab = screen.getByRole('switch', { name: 'Enable for current tab' })
    const globalDefault = screen.getByRole('switch', { name: 'Enable by default' })
    expect(currentTab).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Follow global default' })).toBeDisabled()
    fireEvent.click(currentTab)
    expect(currentTab).toBeChecked()
    expect(globalDefault).not.toBeChecked()
    expect(
      useVimModeStore.getState().perTabOverrides[vimTabKey(props.workspaceKey, props.tabId)],
    ).toBe(true)
    fireEvent.click(globalDefault)
    expect(usePreferencesStore.getState().vimModeEnabled).toBe(true)
    fireEvent.click(currentTab)
    expect(currentTab).not.toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Follow global default' }))
    expect(currentTab).toBeChecked()
    expect(screen.getByRole('button', { name: 'Follow global default' })).toBeDisabled()
  })

  it('labels rich-text scope and read-only availability explicitly', () => {
    usePreferencesStore.setState({ vimModeEnabled: true })
    const { rerender } = render(<VimStatusBarControl {...props} sourceEditor={false} />)
    expect(screen.getByText('Vim: On (source editors)')).toBeInTheDocument()
    rerender(<VimStatusBarControl {...props} readOnlyMode />)
    expect(screen.getByText('Vim: Unavailable (read-only)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Vim mode settings' }))
    expect(screen.getByRole('switch', { name: 'Enable for current tab' })).toBeEnabled()
  })

  it('updates the active editor mode and clears it when the Vim scope is detached', () => {
    usePreferencesStore.setState({ vimModeEnabled: true })
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    const editor = document.createElement('textarea')
    document.body.append(editor)
    const release = registerVimKeyboardScope(editor)
    editor.focus()
    render(<VimStatusBarControl {...props} />)
    expect(screen.getByText('Vim: NORMAL')).toBeInTheDocument()
    act(() => reportVimMode(editor, 'insert'))
    expect(screen.getByText('Vim: INSERT')).toBeInTheDocument()
    act(() => reportVimMode(editor, 'visual'))
    expect(screen.getByText('Vim: VISUAL')).toBeInTheDocument()
    act(() => release())
    expect(screen.getByText('Vim: On')).toBeInTheDocument()
    editor.remove()
    vi.restoreAllMocks()
  })
})
