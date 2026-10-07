import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsDialog from '@/components/SettingsDialog'

const labels: Record<string, string> = {
  'settings.appearance': 'Appearance',
  'settings.description': 'Configure MarkLab desktop preferences.',
  'settings.filesAndSaving': 'Files & saving',
  'settings.filesAndSavingDescription': 'Control files, assets, and save feedback.',
  'settings.general': 'General',
  'settings.generalDescription': 'Configure application and terminal behavior.',
  'settings.group.application': 'Application',
  'settings.group.smart': 'Smart features',
  'settings.group.system': 'System',
  'settings.group.workspace': 'Workspace',
  'settings.loading': 'Loading settings...',
  'settings.search': 'Search settings...',
  'settings.searchNoResults': 'No matching settings',
  'settings.searchResults': 'Setting results',
  'settings.silentSave': 'Silent autosave',
  'settings.title': 'Settings',
}

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }))
vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => labels[key] ?? key }),
}))
vi.mock('@/components/settings/GeneralSettingsPage', () => ({
  default: () => <section>General settings panel</section>,
}))
vi.mock('@/components/settings/AppearanceSettingsPage', () => ({
  default: () => <section>Appearance settings panel</section>,
}))
vi.mock('@/components/settings/FileSettingsPage', () => ({
  default: () => <section>File settings panel</section>,
}))
vi.mock('@/components/settings/SavingSettingsPage', () => ({
  default: () => (
    <section id="settings-save-behavior" tabIndex={-1}>
      Saving settings panel
    </section>
  ),
}))

const renderDialog = () => {
  const onOpenChange = vi.fn()
  render(<SettingsDialog open onOpenChange={onOpenChange} />)
  return { onOpenChange }
}

describe('SettingsDialog search navigation', () => {
  beforeEach(() => {
    vi.mocked(HTMLElement.prototype.scrollIntoView).mockClear()
  })

  it('scrolls to and focuses the exact setting target selected from search', async () => {
    const user = userEvent.setup()
    renderDialog()
    await screen.findByText('General settings panel')
    vi.mocked(HTMLElement.prototype.scrollIntoView).mockClear()

    await user.type(screen.getByRole('searchbox'), 'silent autosave')
    const result = screen.getByRole('option', { name: /Silent autosave/ })
    expect(result).toHaveAttribute('data-setting-target', 'settings-save-behavior')
    await user.click(result)

    const target = await screen.findByText('Saving settings panel')
    await waitFor(() => expect(target).toHaveFocus())
    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: 'center' })
  })

  it('resets the content viewport when a route changes', async () => {
    const user = userEvent.setup()
    renderDialog()
    await screen.findByText('General settings panel')
    const viewport = screen.getByRole('tabpanel').firstElementChild as HTMLElement
    viewport.scrollTop = 180

    await user.click(screen.getByRole('tab', { name: 'Appearance' }))

    expect(await screen.findByText('Appearance settings panel')).toBeInTheDocument()
    expect(viewport.scrollTop).toBe(0)
  })

  it.each(['input', 'result', 'navigation'] as const)(
    'clears search before closing when focus is on $focus',
    async (focus) => {
      const user = userEvent.setup()
      const { onOpenChange } = renderDialog()
      const search = screen.getByRole('searchbox')
      await user.type(search, 'silent autosave')
      if (focus === 'result') await user.keyboard('{ArrowDown}')
      if (focus === 'navigation') screen.getByRole('tab', { name: 'General' }).focus()

      await user.keyboard('{Escape}')

      expect(search).toHaveValue('')
      expect(search).toHaveFocus()
      expect(onOpenChange).not.toHaveBeenCalled()
      await user.keyboard('{Escape}')
      expect(onOpenChange).toHaveBeenCalledWith(false)
    },
  )

  it('does not reference a listbox when search has no results', async () => {
    const user = userEvent.setup()
    renderDialog()
    const search = screen.getByRole('searchbox')

    await user.type(search, 'definitely-not-a-setting')

    expect(screen.getByRole('status')).toHaveTextContent('No matching settings')
    expect(search).toHaveAttribute('aria-expanded', 'false')
    expect(search).not.toHaveAttribute('aria-controls')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
