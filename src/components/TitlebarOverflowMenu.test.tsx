import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import TitlebarOverflowMenu from '@/components/TitlebarOverflowMenu'
import { ImmersiveWorkspaceShell } from '@/components/ImmersiveWorkspaceShell'

const createProps = () => ({
  active: true,
  exportDocxLabel: 'Export as Word',
  exportLabel: 'Export',
  exportPdfLabel: 'Export as PDF',
  graphLabel: 'Mind map',
  moreLabel: 'More actions',
  searchLabel: 'Search files',
  settingsLabel: 'Settings',
  sourceLabel: 'Source editor',
  toggleOutlineLabel: 'Document outline',
  viewMode: 'wysiwyg' as const,
  wysiwygLabel: 'Rich text editor',
  onChangeView: vi.fn(),
  onExport: vi.fn(),
  onOpenSearch: vi.fn(),
  onOpenSettings: vi.fn(),
  onToggleOutline: vi.fn(),
})

const OutlineHarness = ({ onToggle }: { onToggle: () => void }) => {
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const toggleInspector = () => {
    onToggle()
    setInspectorOpen((open) => !open)
  }

  return (
    <ImmersiveWorkspaceShell
      sidebar={<div>Workspace files</div>}
      inspector={<div>Outline content</div>}
      sidebarOpen={false}
      inspectorOpen={inspectorOpen}
      sidebarLabel="Workspace"
      inspectorLabel="Document outline drawer"
      onToggleSidebar={vi.fn()}
      onSidebarOpenChange={vi.fn()}
      onToggleInspector={toggleInspector}
    >
      <TitlebarOverflowMenu {...createProps()} onToggleOutline={toggleInspector} />
    </ImmersiveWorkspaceShell>
  )
}

describe('TitlebarOverflowMenu', () => {
  it('uses the shared application menu treatment for root, submenu, and items', async () => {
    const user = userEvent.setup()
    render(<TitlebarOverflowMenu {...createProps()} />)

    await user.click(screen.getByRole('button', { name: 'More actions' }))
    const rootMenu = screen.getByRole('menu')
    const searchItem = within(rootMenu).getByRole('menuitem', { name: 'Search files' })

    expect(rootMenu).toHaveClass(
      'rounded-xl',
      'border-border/80',
      'bg-popover/98',
      'p-1.5',
      'shadow-xl',
    )
    expect(searchItem).toHaveClass('min-h-8', 'rounded-lg', 'px-2.5', 'text-[13px]')

    await user.hover(within(rootMenu).getByRole('menuitem', { name: 'Rich text editor' }))
    const sourceItem = await screen.findByRole('menuitemradio', { name: 'Source editor' })
    const submenu = sourceItem.closest('[role="menu"]')

    expect(submenu).toHaveClass('rounded-xl', 'border-border/80', 'bg-popover/98', 'p-1.5')
    expect(sourceItem).toHaveClass('min-h-8', 'rounded-lg', 'pl-8', 'pr-2.5', 'text-[13px]')
  })

  it('portals submenus outside the scroll-clipped root menu', async () => {
    const user = userEvent.setup()
    render(<TitlebarOverflowMenu {...createProps()} />)

    await user.click(screen.getByRole('button', { name: 'More actions' }))
    const rootMenu = screen.getByRole('menu')
    await user.hover(within(rootMenu).getByRole('menuitem', { name: 'Rich text editor' }))
    const sourceItem = await screen.findByRole('menuitemradio', { name: 'Source editor' })

    expect(rootMenu).not.toContainElement(sourceItem)
  })

  it('keeps the outline drawer open after the overflow menu closes', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<OutlineHarness onToggle={onToggle} />)

    await user.click(screen.getByRole('button', { name: 'More actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'Document outline' }))

    expect(onToggle).toHaveBeenCalledOnce()
    expect(screen.getByRole('dialog', { name: 'Document outline drawer' })).toBeVisible()
  })
})
