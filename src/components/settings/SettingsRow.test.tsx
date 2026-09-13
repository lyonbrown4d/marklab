import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  SettingsSection,
  SettingsSelectField,
  SettingsSwitchField,
} from '@/components/settings/SettingsRow'

vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

describe('settings fields', () => {
  it('exposes a section heading without requiring a repeated description', () => {
    render(
      <SettingsSection title="General">
        <span>Preferences</span>
      </SettingsSection>,
    )
    expect(screen.getByRole('heading', { name: 'General', level: 2 })).toBeInTheDocument()
    expect(screen.getByText('Preferences')).toBeInTheDocument()
  })

  it('names select controls and reports a selected value', async () => {
    const onValueChange = vi.fn()
    const user = userEvent.setup()
    render(
      <SettingsSelectField
        title="Language"
        description="Interface language"
        value="en"
        onValueChange={onValueChange}
        options={[
          { value: 'en', label: 'English' },
          { value: 'zh', label: 'Chinese' },
        ]}
      />,
    )
    await user.click(screen.getByRole('combobox', { name: 'Language' }))
    await user.click(screen.getByRole('option', { name: 'Chinese' }))
    expect(onValueChange).toHaveBeenCalledWith('zh')
  })

  it('does not change a disabled switch', async () => {
    const onCheckedChange = vi.fn()
    const user = userEvent.setup()
    render(
      <SettingsSwitchField
        title="Status bar"
        description="Editor status"
        checked
        disabled
        onCheckedChange={onCheckedChange}
      />,
    )
    const control = screen.getByRole('switch', { name: 'Status bar' })
    expect(control).toBeDisabled()
    await user.click(control)
    expect(onCheckedChange).not.toHaveBeenCalled()
  })
})
