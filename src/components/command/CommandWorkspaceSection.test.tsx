import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import CommandWorkspaceSection from '@/components/command/CommandWorkspaceSection'

const messages: Record<string, string> = {
  'actions.openAllPages': 'Open All Pages',
  'actions.openTerminal': 'Open Terminal',
  'actions.openWorkspaceGraph': 'Open Workspace Graph',
  'actions.rebuildSearchIndex': 'Rebuild Search Index',
  'actions.rebuildingSearchIndex': 'Rebuilding Search Index…',
  'collection.all': 'All pages',
  'command.singleFileWorkspaceUnavailable':
    'Project graph, collections, and indexing commands are available after opening a folder.',
  'menu.workspace': 'Workspace',
}

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => messages[key] ?? key,
  }),
}))

vi.mock('@/lib/preloadFeatures', () => ({
  preloadAllPagesView: vi.fn(),
  preloadGraphView: vi.fn(),
}))

vi.mock('@/components/ui/command', () => ({
  CommandGroup: ({ children, heading }: { children: ReactNode; heading: string }) => (
    <section aria-label={heading}>{children}</section>
  ),
  CommandItem: ({
    children,
    disabled,
    onSelect,
  }: {
    children: ReactNode
    disabled?: boolean
    onSelect?: () => void
  }) => (
    <button disabled={disabled} onClick={() => onSelect?.()} type="button">
      {children}
    </button>
  ),
  CommandShortcut: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}))

describe('CommandWorkspaceSection', () => {
  it('dispatches workspace and terminal actions from localized command items', () => {
    const onAction = vi.fn()

    render(
      <CommandWorkspaceSection
        collections={[
          {
            count: 3,
            descriptionKey: 'collection.all.description',
            id: 'all',
            labelKey: 'collection.all',
            rules: [{ kind: 'all' }],
          },
        ]}
        onAction={onAction}
        projectWorkspace
        searchIndexRebuilding={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open All Pages' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Terminal' }))
    fireEvent.click(screen.getByRole('button', { name: 'All pages3' }))

    expect(onAction).toHaveBeenCalledWith('workspace.open_pages')
    expect(onAction).toHaveBeenCalledWith('terminal.open')
    expect(onAction).toHaveBeenCalledWith('collection.open:all')
  })

  it('disables project-only commands in single-file mode', () => {
    render(
      <CommandWorkspaceSection
        collections={[]}
        onAction={vi.fn()}
        projectWorkspace={false}
        searchIndexRebuilding={false}
      />,
    )

    expect(
      screen.getByRole('button', {
        name: 'Project graph, collections, and indexing commands are available after opening a folder.',
      }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Open Terminal' })).toBeEnabled()
  })
})
