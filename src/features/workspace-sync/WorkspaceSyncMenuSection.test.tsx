import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceSyncMenuSection } from '@/features/workspace-sync/WorkspaceSyncMenuSection'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { workspaceSyncApi } from '@/services/workspaceSyncApi'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('@/services/workspaceSyncApi', () => ({
  workspaceSyncApi: {
    getChannels: vi.fn(),
    listWebDavProfiles: vi.fn(),
    setChannel: vi.fn(),
    removeChannel: vi.fn(),
  },
}))

const renderSection = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger asChild>
          <Button>workspace</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <WorkspaceSyncMenuSection
            rootKind="external"
            rootPath="C:/notes"
            onConfigureWebDav={vi.fn()}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </QueryClientProvider>,
  )
}

describe('WorkspaceSyncMenuSection', () => {
  it('shows only the WebDAV binding in workspace sync UI', async () => {
    vi.mocked(workspaceSyncApi.getChannels).mockResolvedValue({
      webdav: {
        provider: 'webdav',
        profileId: 'cloud',
        remoteRoot: '/notes',
        autoSync: false,
      },
    })
    vi.mocked(workspaceSyncApi.listWebDavProfiles).mockResolvedValue([])

    renderSection()
    expect(await screen.findByText('/notes')).toBeInTheDocument()
    expect(screen.getAllByText(/sync\.channel\./)).toHaveLength(1)
    expect(screen.queryByText('sync.channel.git')).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /sync\.binding\.configure/ })).toBeInTheDocument()
  })

  it('explains that sync is unavailable for a single file', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <DropdownMenu defaultOpen>
          <DropdownMenuTrigger asChild>
            <Button>workspace</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <WorkspaceSyncMenuSection
              rootKind="single"
              rootPath="C:/notes/readme.md"
              onConfigureWebDav={vi.fn()}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </QueryClientProvider>,
    )
    expect(screen.getByText('sync.singleFileUnavailable')).toBeInTheDocument()
  })
})
