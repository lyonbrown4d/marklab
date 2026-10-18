import { beforeEach, describe, expect, it, vi } from 'vitest'
import { closeWorkspaceTab, type WorkspaceTabCloseContext } from '@/app/workspaceTabClose'
import type { WorkspaceTab } from '@/store/appTypes'
import { gitDiffTabId } from '@/logic/tabs'
import { requestGitConflictClose } from '@/features/git/conflicts/conflictDraftStore'

vi.mock('@/runtime/desktop', () => ({ isDesktopRuntime: () => false }))
vi.mock('@/features/git/conflicts/conflictDraftStore', () => ({
  requestGitConflictClose: vi.fn(() => false),
}))
const id = gitDiffTabId('conflicts', 'note.md')
const fixture = () => {
  const tabs: WorkspaceTab[] = [
    { kind: 'file', path: 'other.md', view: 'edit' },
    { kind: 'git-diff', path: 'note.md', section: 'conflicts' },
  ]
  return {
    rootPathRef: { current: '/repo' },
    tabsRef: { current: tabs },
    activeTabIdRef: { current: id },
    inspectedPathRef: { current: 'note.md' },
    locationPathnameRef: { current: '/git/conflicts/note.md' },
    navigate: vi.fn(),
    setTabs: vi.fn(),
    setActiveTabId: vi.fn(),
    setInspectedPath: vi.fn(),
  } satisfies WorkspaceTabCloseContext
}
beforeEach(() => vi.mocked(requestGitConflictClose).mockReset())
describe('merge tab close', () => {
  it('retains a dirty tab until the user approves, then closes using current tabs', () => {
    const f = fixture()
    let approve!: () => void
    vi.mocked(requestGitConflictClose).mockImplementation((_root, _path, approved) => {
      approve = approved
      return true
    })
    closeWorkspaceTab(f, id)
    expect(f.setTabs).not.toHaveBeenCalled()
    expect(requestGitConflictClose).toHaveBeenCalledWith('/repo', 'note.md', expect.any(Function))
    approve()
    expect(f.setTabs).toHaveBeenCalledWith([f.tabsRef.current[0]])
  })
  it('activates an inactive dirty merge tab so its close confirmation can be shown', () => {
    const f = fixture()
    f.activeTabIdRef.current = 'file:edit:other.md'
    vi.mocked(requestGitConflictClose).mockReturnValue(true)
    closeWorkspaceTab(f, id)
    expect(f.setActiveTabId).toHaveBeenCalledWith(id)
    expect(f.navigate).toHaveBeenCalled()
    expect(f.setTabs).not.toHaveBeenCalled()
  })
  it('never lets an old close confirmation remove tabs after switching workspaces', () => {
    const f = fixture()
    let approve!: () => void
    vi.mocked(requestGitConflictClose).mockImplementation((_root, _path, approved) => {
      approve = approved
      return true
    })
    closeWorkspaceTab(f, id)
    f.rootPathRef.current = '/other'
    approve()
    expect(f.setTabs).not.toHaveBeenCalled()
  })
})
