import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { vi } from 'vitest'
import type { ReactElement } from 'react'
import enUS from '@/i18n/locales/en-US.json'

const managementApi = vi.hoisted(() => ({
  getOperationState: vi.fn(),
  getHistory: vi.fn(),
  getBranches: vi.fn(),
  createBranch: vi.fn(),
  switchBranch: vi.fn(),
  deleteBranch: vi.fn(),
  merge: vi.fn(),
  rebase: vi.fn(),
  getStashes: vi.fn(),
  saveStash: vi.fn(),
  applyStash: vi.fn(),
  dropStash: vi.fn(),
  reset: vi.fn(),
  revert: vi.fn(),
  cherryPick: vi.fn(),
  getCommitFiles: vi.fn(),
  getCommitDiff: vi.fn(),
}))
const facade = vi.hoisted(() => vi.fn())
vi.mock('@/services/gitApi', () => ({ gitApiForWorkspace: facade }))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: translate }) }))

export const translate = (key: string, args: Record<string, unknown> = {}) => {
  const value = (enUS as Record<string, string>)[key]
  return typeof value === 'string'
    ? value.replace(/{{(\w+)}}/g, (_, name: string) => String(args[name] ?? ''))
    : key
}

export const commit = {
  hash: 'a'.repeat(40),
  shortHash: 'aaaaaaa',
  subject: 'Add note',
  author: 'Writer',
  date: '2026-10-14',
  parents: ['b'.repeat(40)],
}
export const clean = {
  repo: { is_repository: true, branch: 'main' },
  staged: [],
  unstaged: [],
  untracked: [],
  conflicts: [],
}

export const resetManagementMocks = () => {
  vi.resetAllMocks()
  facade.mockReturnValue(managementApi)
  managementApi.getOperationState.mockResolvedValue({ operation: null })
  managementApi.getHistory.mockResolvedValue([commit])
  managementApi.getBranches.mockResolvedValue([
    { name: 'main', current: true, remote: false },
    { name: 'feature', current: false, remote: false },
    { name: 'origin/topic', current: false, remote: true },
  ])
  managementApi.getStashes.mockResolvedValue([
    { ref: 'stash@{0}', hash: commit.hash, subject: 'Draft note' },
  ])
  managementApi.getCommitFiles.mockResolvedValue([{ path: 'note.md', status: 'modified' }])
  managementApi.getCommitDiff.mockResolvedValue({
    path: 'note.md',
    original_label: 'parent',
    modified_label: 'commit',
    original_content: 'old line\n',
    modified_content: 'new line\n',
  })
  for (const key of [
    'createBranch',
    'switchBranch',
    'deleteBranch',
    'merge',
    'rebase',
    'saveStash',
    'applyStash',
    'dropStash',
    'revert',
    'cherryPick',
  ] as const)
    managementApi[key].mockResolvedValue(clean)
  managementApi.reset.mockResolvedValue({ status: clean, backupBranch: 'marklab-backup/previous' })
}

export const renderManagement = (element: ReactElement) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return { ...render(<QueryClientProvider client={client}>{element}</QueryClientProvider>), client }
}

export { managementApi, facade }
