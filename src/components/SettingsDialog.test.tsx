import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsDialog from '@/components/SettingsDialog'

const viewport = vi.hoisted(() => ({ mobile: false }))

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => viewport.mobile }))

const labels: Record<string, string> = {
  'settings.appearance': 'Appearance',
  'settings.ai': 'AI',
  'settings.description': 'Configure MarkLab desktop preferences.',
  'settings.editing': 'Editing',
  'settings.files': 'Files',
  'settings.filesAndSaving': 'Files & saving',
  'settings.filesAndSavingDescription': 'Control files, assets, and save feedback.',
  'settings.general': 'General',
  'settings.generalDescription': 'Configure application and terminal behavior.',
  'settings.graphEditor': 'Graph editor',
  'settings.group.application': 'Application',
  'settings.group.smart': 'Smart features',
  'settings.group.system': 'System',
  'settings.group.workspace': 'Workspace',
  'settings.loading': 'Loading settings...',
  'settings.search': 'Search settings...',
  'settings.searchNoResults': 'No matching settings',
  'settings.saveBehavior': 'Saving',
  'settings.silentSave': 'Silent autosave',
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

vi.mock('@/components/settings/AiSettingsPage', () => ({
  default: () => <section>AI settings panel</section>,
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
  beforeEach(() => {
    viewport.mobile = false
  })

  it.each([
    { mobile: false, orientation: 'vertical', forward: '{ArrowDown}', backward: '{ArrowUp}' },
    { mobile: true, orientation: 'horizontal', forward: '{ArrowRight}', backward: '{ArrowLeft}' },
  ])(
    'matches keyboard navigation to the $orientation layout',
    async ({ mobile, orientation, forward, backward }) => {
      viewport.mobile = mobile
      const user = userEvent.setup()
      renderSettingsDialog()
      await screen.findByText('General settings panel')
      expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', orientation)
      const general = screen.getByRole('tab', { name: 'General' })
      await user.click(general)
      await user.keyboard(forward)
      expect(await screen.findByText('Appearance settings panel')).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Appearance' })).toHaveFocus()
      expect(screen.queryByText('General settings panel')).not.toBeInTheDocument()
      await user.keyboard(backward)
      expect(await screen.findByText('General settings panel')).toBeInTheDocument()
      expect(general).toHaveFocus()
    },
  )

  it('closes with Escape', async () => {
    const user = userEvent.setup()
    const { onOpenChange } = renderSettingsDialog()
    await screen.findByText('General settings panel')
    await user.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

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

  it('opens AI configuration as a first-class settings section', async () => {
    const user = userEvent.setup()
    renderSettingsDialog()

    await user.click(screen.getByRole('tab', { name: 'AI' }))

    expect(await screen.findByText('AI settings panel')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'AI' })).toHaveAttribute('aria-current', 'page')
  })

  it('groups navigation and combines file and saving settings', async () => {
    const user = userEvent.setup()
    renderSettingsDialog()

    expect(screen.getByText('Application')).toBeInTheDocument()
    expect(screen.getByText('Workspace')).toBeInTheDocument()
    expect(screen.getByText('Smart features')).toBeInTheDocument()
    expect(screen.getByText('System')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Files' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Saving' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Files & saving' }))

    expect(await screen.findByText('File settings panel')).toBeInTheDocument()
    expect(screen.getByText('Saving settings panel')).toBeInTheDocument()
  })

  it('searches setting items and opens the matching page', async () => {
    const user = userEvent.setup()
    renderSettingsDialog()

    const search = screen.getByRole('searchbox', { name: 'Search settings...' })
    await user.type(search, 'silent autosave')
    await user.click(screen.getByRole('option', { name: /Silent autosave/ }))

    expect(screen.getByRole('tab', { name: 'Files & saving' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(await screen.findByText('Saving settings panel')).toBeInTheDocument()
  })

  it('moves from search into results with the keyboard and opens the focused result', async () => {
    const user = userEvent.setup()
    renderSettingsDialog()

    const search = screen.getByRole('searchbox', { name: 'Search settings...' })
    await user.type(search, 'silent autosave')
    expect(search).toHaveAttribute('aria-expanded', 'true')
    expect(search).toHaveAttribute('aria-controls')

    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('option', { name: /Silent autosave/ })).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(screen.getByRole('tab', { name: 'Files & saving' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('focuses settings search with the displayed shortcut', async () => {
    const user = userEvent.setup()
    renderSettingsDialog()

    await user.keyboard('{Control>},{/Control}')

    expect(screen.getByRole('searchbox', { name: 'Search settings...' })).toHaveFocus()
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
