import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import userEvent from '@testing-library/user-event'
import { SettingsSearch } from '@/components/settings/SettingsSearch'
import EditingSettingsPage from '@/components/settings/EditingSettingsPage'
import i18n from '@/i18n/setup'
import { usePreferencesStore } from '@/store/usePreferencesStore'

beforeEach(async () => {
  localStorage.clear()
  usePreferencesStore.setState({
    locale: 'en-US',
    sourceCodeMiniMapEnabled: true,
    vimModeEnabled: false,
    markdownContentWidth: 'standard',
  })
  await i18n.changeLanguage('en-US')
})

describe('EditingSettingsPage', () => {
  it('lets users choose standard or full-view body width', async () => {
    const user = userEvent.setup()
    render(<EditingSettingsPage />)
    const width = screen.getByRole('combobox', { name: 'Content width' })
    expect(width).toHaveTextContent('Standard')
    await user.click(width)
    await user.click(screen.getByRole('option', { name: 'Fill view' }))
    expect(usePreferencesStore.getState().markdownContentWidth).toBe('full')
    expect(width).toHaveTextContent('Fill view')
    await user.click(width)
    await user.click(screen.getByRole('option', { name: 'Standard' }))
    expect(usePreferencesStore.getState().markdownContentWidth).toBe('standard')
  })

  it('toggles the global Vim default', () => {
    render(<EditingSettingsPage />)
    const vimMode = screen.getByRole('switch', { name: 'Vim mode' })
    expect(vimMode).not.toBeChecked()
    expect(screen.getByText(i18n.t('settings.vimModeDescription'))).toBeInTheDocument()

    fireEvent.click(vimMode)
    expect(vimMode).toBeChecked()
    expect(usePreferencesStore.getState().vimModeEnabled).toBe(true)

    fireEvent.click(vimMode)
    expect(vimMode).not.toBeChecked()
    expect(usePreferencesStore.getState().vimModeEnabled).toBe(false)
  })

  it('localizes the source-editor Vim setting in Chinese', async () => {
    usePreferencesStore.getState().setLocale('zh-CN')
    await i18n.changeLanguage('zh-CN')
    render(<EditingSettingsPage />)
    expect(screen.getByRole('switch', { name: 'Vim 模式' })).not.toBeChecked()
    expect(screen.getByText(i18n.t('settings.vimModeDescription'))).toBeInTheDocument()
  })

  it('finds Vim mode in settings search and navigates to the source editor section', () => {
    const onSelect = vi.fn()
    const onQueryChange = vi.fn()
    render(
      <SettingsSearch
        inputRef={createRef<HTMLInputElement>()}
        query="vim"
        onQueryChange={onQueryChange}
        onSelect={onSelect}
      />,
    )
    fireEvent.click(screen.getByRole('option', { name: 'Vim mode · Editing' }))
    expect(onSelect).toHaveBeenCalledWith('editing', 'settings-source-code')
    expect(onQueryChange).toHaveBeenCalledWith('')
  })

  it('lets users toggle the source editor minimap', () => {
    render(<EditingSettingsPage />)

    const miniMap = screen.getByRole('switch', { name: 'Show minimap' })
    expect(miniMap).toBeChecked()

    fireEvent.click(miniMap)

    expect(usePreferencesStore.getState().sourceCodeMiniMapEnabled).toBe(false)
  })
})
