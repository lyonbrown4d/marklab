import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import SavingSettingsPage from '@/components/settings/SavingSettingsPage'
import i18n from '@/i18n/setup'
import { usePreferencesStore } from '@/store/usePreferencesStore'

beforeEach(async () => {
  usePreferencesStore.setState(usePreferencesStore.getInitialState(), true)
  usePreferencesStore.setState({ locale: 'en-US', silentSave: true })
  await i18n.changeLanguage('en-US')
})

describe('SavingSettingsPage', () => {
  it('presents save feedback as one mutually exclusive choice', async () => {
    const user = userEvent.setup()
    render(<SavingSettingsPage />)

    expect(screen.getByRole('radiogroup', { name: 'Saving' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Silent autosave/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Show detailed save state/ })).not.toBeChecked()
    expect(screen.queryAllByRole('switch')).toHaveLength(0)

    await user.click(screen.getByRole('radio', { name: /Show detailed save state/ }))

    expect(usePreferencesStore.getState().silentSave).toBe(false)
    expect(screen.getByRole('radio', { name: /Show detailed save state/ })).toBeChecked()
  })
})
