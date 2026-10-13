import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceRecoveryPanel } from '@/app/WorkspaceRecoveryPanel'
import { useWorkspaceRestoreRecovery } from '@/app/useWorkspaceRestoreRecovery'
import { useWorkspaceRecoveryBridge } from '@/app/useWorkspaceRecoveryBridge'
import EditorPaneFallback from '@/pages/EditorPaneFallback'

const mocks = vi.hoisted(() => ({
  loadWorkspace: vi.fn(async () => undefined),
  openDialog: vi.fn(),
  openFolder: vi.fn(async () => true),
  setRoot: vi.fn(),
  useInternalRoot: vi.fn(async () => true),
}))

vi.mock('@/runtime/dialog', () => ({ openDialog: mocks.openDialog }))
vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/runtime/rendererLifecycle', () => ({
  consumeWorkspaceSessionSeed: vi.fn(),
  hasPendingWorkspaceSessionSeed: () => false,
  onWorkspaceSessionSeed: () => () => undefined,
  waitForWorkspaceInteractivePaint: async () => undefined,
}))
vi.mock('@/app/workspaceRestoreReady', () => ({ reportWorkspaceRendererReady: vi.fn() }))
vi.mock('@/app/editorCloseLifecycle', () => ({ flushEditorChanges: vi.fn() }))
vi.mock('@/services/fsApi', () => ({ fsApi: { setRoot: mocks.setRoot } }))
vi.mock('@/services/workspaceTreeApi', () => ({
  workspaceTreeApi: { onChanged: () => () => undefined },
}))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const RecoveryHarness = () => {
  const [rootPath, setRootPath] = useState('/tmp/Notes')
  const recoveryBridge = useWorkspaceRecoveryBridge()
  const restore = useWorkspaceRestoreRecovery({
    hasHydrated: true,
    rootKind: 'external',
    rootPath,
    loadWorkspace: mocks.loadWorkspace,
    openFolder: mocks.openFolder,
    onUseInternalRoot: mocks.useInternalRoot,
    recoveryBridge,
  })
  const recovery = restore.workspaceRecovery
  const switchFromMenu = async () => {
    await recoveryBridge.onBeforeWorkspaceOpen()
    setRootPath('/another')
    await recoveryBridge.onWorkspaceOpened()
  }
  return (
    <>
      <button onClick={() => void switchFromMenu()}>Open from menu</button>
      {restore.restoreFailure ? (
        <WorkspaceRecoveryPanel
          failure={restore.restoreFailure}
          busyAction={recovery.busyAction}
          restoring={restore.isRestoringSession}
          error={recovery.error}
          onRecover={recovery.recover}
        />
      ) : restore.isSessionRestored ? (
        <p>Workspace ready</p>
      ) : (
        <EditorPaneFallback />
      )}
    </>
  )
}

describe('workspace recovery flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.setRoot.mockRejectedValue(new Error('Directory no longer exists'))
    mocks.openDialog.mockResolvedValue('/tmp/RenamedNotes')
    mocks.openFolder.mockResolvedValue(true)
    mocks.useInternalRoot.mockResolvedValue(true)
  })

  it('replaces document loading with recovery even without a statusbar', async () => {
    const { container } = render(<RecoveryHarness />)
    expect(await screen.findByRole('alert')).toHaveTextContent('/tmp/Notes')
    expect(container.querySelector('[data-editor-loading]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'app.restoreRetry' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'app.restoreRetry' })).toBeEnabled(),
    )
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent('/tmp/Notes')
    expect(container.querySelector('[data-editor-loading]')).toBeNull()
  })

  it('retains the failure after cancelling and resumes after relocating', async () => {
    mocks.openDialog.mockResolvedValueOnce(null)
    const { container } = render(<RecoveryHarness />)
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'app.workspaceRecoveryRelocate' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'app.restoreRetry' })).toBeEnabled(),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('/tmp/Notes')
    expect(mocks.openFolder).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'app.workspaceRecoveryRelocate' }))
    expect(await screen.findByText('Workspace ready')).toBeVisible()
    expect(mocks.openFolder).toHaveBeenCalledWith('/tmp/RenamedNotes', { preserveTabs: true })
    expect(container.querySelector('[data-editor-loading]')).toBeNull()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('removes recovery after another successful workspace open in the same window', async () => {
    render(<RecoveryHarness />)
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Open from menu' }))
    expect(await screen.findByText('Workspace ready')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(mocks.setRoot).toHaveBeenCalledExactlyOnceWith('/tmp/Notes')
  })
})
