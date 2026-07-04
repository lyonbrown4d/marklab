import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RightSidebarAssetsPanel } from '@/components/assets/RightSidebarAssetsPanel'
import type { MarkdownAssetReference, MarkdownAssetReport } from '@/logic/assets'

const copyTextMock = vi.hoisted(() => vi.fn())

vi.mock('@/components/file-tree/fileTreeActions', () => ({
  copyText: copyTextMock,
}))

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({
    children,
    className,
    viewportClassName,
  }: {
    children: ReactNode
    className?: string
    viewportClassName?: string
  }) => (
    <section className={className} data-viewport-class={viewportClassName}>
      {children}
    </section>
  ),
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      const labels: Record<string, string> = {
        'assets.action.copy': 'Copy path',
        'assets.action.open': 'Open',
        'assets.action.reveal': 'Reveal',
        'assets.currentFileAssets': `${values?.count ?? 0} local assets`,
        'assets.description': 'Inspect markdown asset references.',
        'assets.missingCount': `${values?.count ?? 0} missing`,
        'assets.noActiveFile': 'No active file',
        'assets.noLocalAssets': 'No local assets',
        'assets.noMissingAssets': 'No missing assets',
        'assets.noMissingAssetsDescription': 'All workspace assets resolve.',
        'assets.openFileToInspect': 'Open a file to inspect assets.',
        'assets.status.missing': 'Missing',
        'assets.status.ready': 'Ready',
        'assets.status.unverified': 'Unverified',
        'assets.title': 'Assets',
        'assets.working': 'Working',
        'assets.workspaceMissingAssets': 'Workspace missing assets',
      }

      return labels[key] ?? key
    },
  }),
}))

const asset: MarkdownAssetReference = {
  column: 3,
  context: '![Cover](images/cover.png)',
  id: 'asset-1',
  line: 8,
  mediaType: 'image/png',
  sourcePath: 'notes/readme.md',
  status: 'available',
  target: 'images/cover.png',
  targetPath: '/workspace/images/cover.png',
}

const report: MarkdownAssetReport = {
  currentAssetCount: 1,
  currentAssets: [asset],
  currentMissingCount: 0,
  currentPath: 'notes/readme.md',
  indexed: true,
  limit: 80,
  workspaceMissingAssets: [],
  workspaceMissingCount: 0,
}

describe('RightSidebarAssetsPanel', () => {
  it('renders action failures with the shared alert surface', async () => {
    const user = userEvent.setup()
    copyTextMock.mockRejectedValueOnce(new Error('Clipboard unavailable'))

    render(<RightSidebarAssetsPanel report={report} />)

    await user.click(screen.getByRole('button', { name: 'Copy path' }))

    const alert = await screen.findByRole('alert')

    expect(alert).toHaveTextContent('Clipboard unavailable')
    expect(alert).toHaveClass('text-destructive')
  })
})
