import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
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
  })
  await i18n.changeLanguage('en-US')
})

describe('EditingSettingsPage', () => {
  it('toggles Vim mode for the documented source editor surfaces', () => {
    render(<EditingSettingsPage />)
    const vimMode = screen.getByRole('switch', { name: 'Vim mode (source editors)' })
    expect(vimMode).not.toBeChecked()
    expect(screen.getByText(/Normal mode for commands.*Mermaid source/)).toBeInTheDocument()
    expect(screen.getByText(/Rich text editing is unchanged/)).toBeInTheDocument()

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
    expect(screen.getByRole('switch', { name: 'Vim 模式（源码编辑器）' })).not.toBeChecked()
    expect(screen.getByText(/Normal（普通）.*Insert（插入）.*Visual（可视）/)).toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('option', { name: 'Vim mode (source editors) · Editing' }))
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
