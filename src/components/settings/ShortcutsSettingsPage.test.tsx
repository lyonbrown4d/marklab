import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import ShortcutsSettingsPage from '@/components/settings/ShortcutsSettingsPage'
import i18n from '@/i18n/setup'
import { usePreferencesStore } from '@/store/usePreferencesStore'

beforeEach(async () => {
  localStorage.clear()
  usePreferencesStore.setState({ locale: 'en-US', shortcutOverrides: {} })
  await i18n.changeLanguage('en-US')
})

describe('ShortcutsSettingsPage', () => {
  it('uses compact shadcn sizing for shortcut search affordances and clears search text', () => {
    render(<ShortcutsSettingsPage />)

    const searchIcon = document.querySelector('.settings-shortcuts-search-icon')
    expect(searchIcon).toHaveClass('size-4')
    expect(searchIcon).not.toHaveClass('h-4')
    expect(searchIcon).not.toHaveClass('w-4')

    const searchInput = screen.getByRole('textbox', { name: 'Search shortcuts' })
    fireEvent.change(searchInput, { target: { value: 'unlikely shortcut query' } })

    const clearButton = screen.getByRole('button', { name: 'Clear search' })
    expect(clearButton).toHaveClass('size-7')
    expect(clearButton).not.toHaveClass('h-7')
    expect(clearButton).not.toHaveClass('w-7')

    fireEvent.click(clearButton)

    expect(searchInput).toHaveValue('')
  })
})
