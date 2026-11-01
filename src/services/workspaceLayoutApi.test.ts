import { beforeEach, expect, it, vi } from 'vitest'
import { invoke } from '@/runtime/ipc'
import { workspaceLayoutApi, type WorkspaceLayout } from '@/services/workspaceLayoutApi'

vi.mock('@/runtime/ipc', () => ({ invoke: vi.fn() }))
beforeEach(() => vi.mocked(invoke).mockReset())

const layout: WorkspaceLayout = {
  grid: { root: { type: 'branch', data: [] }, width: 1000, height: 800, orientation: 'HORIZONTAL' },
  panels: {},
}

it('loads canonical workspace metadata and saves with its exact binding generation', async () => {
  vi.mocked(invoke).mockResolvedValueOnce({ layout, session_generation: 42 })
  const loaded = await workspaceLayoutApi.get('external:/workspace')
  expect(invoke).toHaveBeenLastCalledWith('fs_get_workspace_layout', {
    workspace_key: 'external:/workspace',
  })
  vi.mocked(invoke).mockResolvedValueOnce({ saved: true })
  await workspaceLayoutApi.set('external:/workspace', loaded.session_generation, layout)
  expect(invoke).toHaveBeenLastCalledWith('fs_set_workspace_layout', {
    workspace_key: 'external:/workspace',
    session_generation: 42,
    layout,
  })
})

it('propagates native failures and rejects an unacknowledged save', async () => {
  const failure = new Error('stale workspace')
  vi.mocked(invoke).mockRejectedValueOnce(failure)
  await expect(workspaceLayoutApi.get('old')).rejects.toBe(failure)
  vi.mocked(invoke).mockResolvedValueOnce({ saved: false })
  await expect(workspaceLayoutApi.set('old', 1, layout)).rejects.toThrow('not saved')
})
