import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RightSidebar from '@/components/RightSidebar'
import { useRightSidebarData } from '@/components/useRightSidebarData'

vi.mock('@/components/useRightSidebarData', () => ({ useRightSidebarData: vi.fn() }))

const useSidebarData = vi.mocked(useRightSidebarData)
const retryInsights = vi.fn()

const data = {
  outline: [],
  backlinks: [],
  problems: [],
  errorProblems: [],
  warningProblems: [],
  documentStats: { lines: 2, words: 3 },
  documentStatsLoading: false,
  documentStatsError: null,
  displayMetadata: null,
  loadingMetadata: false,
  assetReport: {
    indexed: true,
    currentPath: 'target.md',
    currentAssets: [],
    currentAssetCount: 0,
    currentMissingCount: 0,
    workspaceMissingAssets: [],
    workspaceMissingCount: 0,
    limit: 80,
  },
  knowledge: {
    incoming: [],
    outgoing: [],
    missing: [],
    incomingCount: 0,
    outgoingCount: 0,
    missingCount: 0,
    orphan: true,
  },
  insightsLoading: false,
  insightsError: null,
  retryInsights,
}

const props = {
  collapsed: false,
  workspaceKey: 'external:D:/wiki',
  activePath: 'target.md',
  inspectedPath: null,
  editorValue: '# Target',
  fileContents: { 'target.md': '# Target' },
  tabs: ['target.md'],
  totalFiles: 1,
  onOpenFileView: vi.fn(),
  viewMode: 'wysiwyg' as const,
}

describe('RightSidebar request states', () => {
  beforeEach(() => {
    retryInsights.mockReset()
    useSidebarData.mockReturnValue(data)
  })

  it('announces document insight loading', () => {
    useSidebarData.mockReturnValue({ ...data, insightsLoading: true })
    render(<RightSidebar {...props} />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading')
  })

  it('shows a retriable document insight error', () => {
    useSidebarData.mockReturnValue({ ...data, insightsError: 'Index unavailable' })
    render(<RightSidebar {...props} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Index unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retryInsights).toHaveBeenCalledOnce()
  })
})
