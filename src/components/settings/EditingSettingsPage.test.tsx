import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import EditingSettingsPage from '@/components/settings/EditingSettingsPage'
import i18n from '@/i18n/setup'
import { usePreferencesStore } from '@/store/usePreferencesStore'

beforeEach(async () => {
  localStorage.clear()
  usePreferencesStore.setState({
    locale: 'en-US',
    sourceCodeMiniMapEnabled: true,
  })
  await i18n.changeLanguage('en-US')
})

describe('EditingSettingsPage', () => {
  it('lets users toggle the source editor minimap', () => {
    render(<EditingSettingsPage />)

    const miniMap = screen.getByRole('switch', { name: 'Show minimap' })
    expect(miniMap).toBeChecked()

    fireEvent.click(miniMap)

    expect(usePreferencesStore.getState().sourceCodeMiniMapEnabled).toBe(false)
  })
})
