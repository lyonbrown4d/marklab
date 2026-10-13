import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { vi } from 'vitest'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { RecentWorkspaceMenuSection } from '@/components/titlebar/RecentWorkspaceMenuSection'
import type { RecentWorkspaceMenuData } from '@/components/TitlebarWorkspaceMenu'
import type { RecentWorkspace } from '@/types/recentWorkspaces'

export const entries: RecentWorkspace[] = [
  { path: '/notes', status: 'available' },
  { path: '/other', status: 'available' },
  { path: '/missing', status: 'missing' },
  { path: '/private', status: 'unavailable' },
]

const Harness = ({
  onOpenProject,
  rootKind,
}: {
  onOpenProject: (path: string) => void
  rootKind: RecentWorkspaceMenuData['rootKind']
}) => {
  const [open, setOpen] = useState(false)
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger>Workspaces</DropdownMenuTrigger>
      <DropdownMenuContent>
        <RecentWorkspaceMenuSection
          data={{
            paths: entries.map((entry) => entry.path),
            rootPath: '/notes',
            rootKind,
            currentLabel: 'Current',
            openLabel: 'Open {name}',
            emptyLabel: 'No history',
            sectionLabel: 'Recent',
          }}
          enabled={open}
          opening={false}
          onOpenProject={onOpenProject}
          onRemoved={() => setOpen(false)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const renderMenu = async (rootKind: RecentWorkspaceMenuData['rootKind'] = 'external') => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const onOpenProject = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <Harness onOpenProject={onOpenProject} rootKind={rootKind} />
    </QueryClientProvider>,
  )
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Workspaces' }))
  return { user, onOpenProject }
}
