import { fireEvent, render, screen } from '@testing-library/react'
import type { AriaAttributes, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import CommandActionSections from '@/components/command/CommandActionSections'

const preferenceState = vi.hoisted(() => ({
  customThemeId: null,
  shortcutOverrides: {},
  theme: 'ink',
  themeMode: 'dark',
}))

const messages: Record<string, string> = {
  'actions.about': 'About',
  'actions.closeTab': 'Close Tab',
  'actions.exportDocx': 'Export DOCX',
  'actions.exportHtml': 'Export HTML',
  'actions.exportPdf': 'Export PDF',
  'actions.newWindow': 'New Window',
  'actions.openFile': 'Open File',
  'actions.openProject': 'Open Project',
  'actions.toggleRightSidebar': 'Toggle Right Sidebar',
  'actions.toggleSidebar': 'Toggle Sidebar',
  'command.singleFileCreateUnavailable': 'Open a folder to create files or folders.',
  'editor.modeSource': 'Source Editor',
  'editor.modeWysiwyg': 'Rich Text Editor',
  'menu.file': 'File',
  'menu.help': 'Help',
  'menu.settings': 'Settings',
  'menu.theme': 'Theme',
  'menu.view': 'View',
  'shortcuts.commandPalette': 'Command Palette',
  'sidebar.newFile': 'New File',
  'sidebar.newFolder': 'New Folder',
  'sidebar.searchAction': 'Search Files',
  'tabs.graph': 'Graph',
  'theme.ink': 'Ink',
  'theme.paper': 'Paper',
  'themeMode.dark': 'Dark',
  'themeMode.light': 'Light',
  'themeMode.system': 'System',
}

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => messages[key] ?? key,
  }),
}))

vi.mock('@/store/usePreferencesStore', () => ({
  usePreferencesStore: <T,>(selector: (state: typeof preferenceState) => T) =>
    selector(preferenceState),
}))

vi.mock('@/logic/themes', () => ({
  builtInThemes: [
    { labelKey: 'theme.ink', swatchClass: 'bg-slate-950', value: 'ink' },
    { labelKey: 'theme.paper', swatchClass: 'bg-white', value: 'paper' },
  ],
  themeActionId: (theme: string) => `theme:${theme}`,
  themeModeActionId: (mode: string) => `theme-mode:${mode}`,
}))

vi.mock('@/lib/preloadFeatures', () => ({
  preloadGraphView: vi.fn(),
  preloadSourceEditor: vi.fn(),
  preloadWysiwygEditor: vi.fn(),
}))

vi.mock('@/components/command/CommandWorkspaceSection', () => ({
  default: ({
    onAction,
    projectWorkspace,
  }: {
    onAction: (id: string) => void
    projectWorkspace: boolean
  }) => (
    <section aria-label="Workspace commands">
      <button
        disabled={!projectWorkspace}
        onClick={() => onAction('workspace.open_pages')}
        type="button"
      >
        Workspace child
      </button>
    </section>
  ),
}))

vi.mock('@/components/command/CommandActionHelpers', () => ({
  CommandActionShortcut: ({ label }: { label?: string }) => (label ? <kbd>{label}</kbd> : null),
  CurrentItemCheck: () => <span aria-hidden="true">Current</span>,
  commandActionShortcutIds: {
    closeTab: 'closeTab',
    commandPalette: 'commandPalette',
    newFile: 'newFile',
    openFile: 'openFile',
    openProject: 'openProject',
    settings: 'settings',
    toggleRightSidebar: 'toggleRightSidebar',
    toggleSidebar: 'toggleSidebar',
    viewGraph: 'viewGraph',
    viewSource: 'viewSource',
    viewWysiwyg: 'viewWysiwyg',
  },
  createShortcutLabels: () => ({
    closeTab: 'Ctrl+W',
    commandPalette: 'Mod+K',
    newFile: 'Ctrl+N',
    openFile: 'Ctrl+O',
    openProject: 'Ctrl+Shift+O',
    settings: 'Ctrl+,',
    toggleRightSidebar: 'Ctrl+Shift+R',
    toggleSidebar: 'Ctrl+B',
    viewGraph: 'Ctrl+3',
    viewSource: 'Ctrl+2',
    viewWysiwyg: 'Ctrl+1',
  }),
  currentCommandItemClassName: 'bg-accent text-accent-foreground',
}))

vi.mock('@/components/ui/command', () => ({
  CommandGroup: ({ children, heading }: { children: ReactNode; heading?: string }) => (
    <section aria-label={heading ?? 'Quick actions'}>{children}</section>
  ),
  CommandItem: ({
    'aria-current': ariaCurrent,
    children,
    className,
    disabled,
    onFocus,
    onMouseEnter,
    onSelect,
  }: {
    'aria-current'?: AriaAttributes['aria-current']
    children: ReactNode
    className?: string
    disabled?: boolean
    onFocus?: () => void
    onMouseEnter?: () => void
    onSelect?: () => void
    value?: string
  }) => (
    <button
      aria-current={ariaCurrent}
      className={className}
      disabled={disabled}
      onClick={() => onSelect?.()}
      onFocus={() => onFocus?.()}
      onMouseEnter={() => onMouseEnter?.()}
      type="button"
    >
      {children}
    </button>
  ),
  CommandSeparator: () => <hr />,
}))

const renderActions = (options?: { canCreateWorkspaceEntries?: boolean }) => {
  const onAction = vi.fn()
  const onCommandPaletteAction = vi.fn()

  render(
    <CommandActionSections
      canCreateWorkspaceEntries={options?.canCreateWorkspaceEntries ?? true}
      collections={[]}
      onAction={onAction}
      onCommandPaletteAction={onCommandPaletteAction}
      searchIndexRebuilding={false}
    />,
  )

  return { onAction, onCommandPaletteAction }
}

const buttonFromText = (text: string) => {
  const button = screen.getByText(text).closest('button')
  if (!button) throw new Error(`Missing button for ${text}`)
  return button
}

describe('CommandActionSections', () => {
  it('dispatches primary file and palette commands with localized labels', () => {
    const { onAction, onCommandPaletteAction } = renderActions()

    fireEvent.click(buttonFromText('Command Palette'))
    fireEvent.click(buttonFromText('New File'))
    fireEvent.click(buttonFromText('Open File'))
    fireEvent.click(screen.getByRole('button', { name: 'Workspace child' }))

    expect(onCommandPaletteAction).toHaveBeenCalledTimes(1)
    expect(onAction).toHaveBeenCalledWith('file.new')
    expect(onAction).toHaveBeenCalledWith('file.open_file')
    expect(onAction).toHaveBeenCalledWith('workspace.open_pages')
  })

  it('shows a disabled create hint in single-file mode while keeping global commands available', () => {
    const { onAction } = renderActions({ canCreateWorkspaceEntries: false })

    expect(
      screen.getByRole('button', { name: 'Open a folder to create files or folders.' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Workspace child' })).toBeDisabled()

    fireEvent.click(buttonFromText('Open File'))

    expect(onAction).toHaveBeenCalledWith('file.open_file')
  })

  it('marks current theme choices and dispatches theme selection actions', () => {
    const { onAction } = renderActions()

    expect(buttonFromText('Dark')).toHaveAttribute('aria-current', 'true')
    expect(buttonFromText('Ink')).toHaveAttribute('aria-current', 'true')

    fireEvent.click(buttonFromText('Light'))
    fireEvent.click(buttonFromText('Paper'))

    expect(onAction).toHaveBeenCalledWith('theme-mode:light')
    expect(onAction).toHaveBeenCalledWith('theme:paper')
  })
})
