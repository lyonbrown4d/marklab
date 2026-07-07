import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import SettingsDialog from '@/components/SettingsDialog'

const labels: Record<string, string> = {
  'settings.appearance': 'Appearance',
  'settings.description': 'Configure MarkLab desktop preferences.',
  'settings.editing': 'Editing',
  'settings.files': 'Files',
  'settings.general': 'General',
  'settings.graphEditor': 'Graph editor',
  'settings.loading': 'Loading settings...',
  'settings.saveBehavior': 'Saving',
  'settings.shortcuts': 'Shortcuts',
  'settings.title': 'Settings',
}

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => labels[key] ?? key,
  }),
}))

vi.mock('@/components/settings/AppearanceSettingsPage', () => ({
  default: () => <section>Appearance settings panel</section>,
}))

vi.mock('@/components/settings/EditingSettingsPage', () => ({
  default: () => <section>Editing settings panel</section>,
}))

vi.mock('@/components/settings/FileSettingsPage', () => ({
  default: () => <section>File settings panel</section>,
}))

vi.mock('@/components/settings/GeneralSettingsPage', () => ({
  default: () => <section>General settings panel</section>,
}))

vi.mock('@/components/settings/GraphSettingsPage', () => ({
  default: () => <section>Graph settings panel</section>,
}))

vi.mock('@/components/settings/SavingSettingsPage', () => ({
  default: () => <section>Saving settings panel</section>,
}))

vi.mock('@/components/settings/ShortcutsSettingsPage', () => ({
  default: () => <section>Shortcuts settings panel</section>,
}))

const renderSettingsDialog = () => {
  const onOpenChange = vi.fn()
  render(<SettingsDialog open onOpenChange={onOpenChange} />)
  return { onOpenChange }
}

describe('SettingsDialog', () => {
  it('exposes a named dialog and settings tablist', async () => {
    renderSettingsDialog()

    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('tablist', { name: 'Settings' })).toBeInTheDocument()

    const generalTab = screen.getByRole('tab', { name: 'General' })
    expect(generalTab).toHaveAttribute('aria-selected', 'true')
    expect(generalTab).toHaveAttribute('aria-current', 'page')
    expect(generalTab).toHaveAttribute('title', 'General')
    expect(screen.getByRole('status', { name: 'Loading settings...' })).toHaveAttribute(
      'aria-busy',
      'true',
    )
    expect(await screen.findByText('General settings panel')).toBeInTheDocument()
  })

  it('updates the active section when a settings tab is selected', async () => {
    const user = userEvent.setup()
    renderSettingsDialog()

    const generalTab = screen.getByRole('tab', { name: 'General' })
    const appearanceTab = screen.getByRole('tab', { name: 'Appearance' })

    await user.click(appearanceTab)

    expect(appearanceTab).toHaveAttribute('aria-selected', 'true')
    expect(appearanceTab).toHaveAttribute('aria-current', 'page')
    expect(generalTab).toHaveAttribute('aria-selected', 'false')
    expect(generalTab).not.toHaveAttribute('aria-current')
    expect(screen.getByText('Appearance settings panel')).toBeInTheDocument()
  })

  it('keeps the active settings tab in view when sections change', async () => {
    const scrollIntoView = vi
      .spyOn(window.HTMLElement.prototype, 'scrollIntoView')
      .mockImplementation(() => undefined)

    try {
      const user = userEvent.setup()
      renderSettingsDialog()

      await user.click(screen.getByRole('tab', { name: 'Shortcuts' }))

      expect(scrollIntoView).toHaveBeenLastCalledWith({
        block: 'nearest',
        inline: 'nearest',
      })
    } finally {
      scrollIntoView.mockRestore()
    }
  })
})
