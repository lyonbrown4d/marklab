import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fsApi } from '@/services/fsApi'

const runtime = vi.hoisted(() => ({
  assets: {
    issueCapability: vi.fn(),
  },
  workspace: {
    copyAbsolutePathToClipboard: vi.fn(),
    openPathInSystem: vi.fn(),
    readTextPreview: vi.fn(),
    revealPathInSystem: vi.fn(),
  },
}))

vi.mock('@/runtime/electron', () => ({ getElectronRuntime: () => runtime }))

describe('fsApi named IPC', () => {
  beforeEach(() => vi.clearAllMocks())

  it('delegates asset capability operations to the named asset API', async () => {
    const capability = {
      url: 'marklab-asset://local/v1/token',
      expires_at_ms: Date.now() + 10_000,
    }
    runtime.assets.issueCapability.mockResolvedValue(capability)

    await expect(fsApi.toAssetUrl('images/photo.png')).resolves.toEqual(capability)

    expect(runtime.assets.issueCapability).toHaveBeenCalledWith({ path: 'images/photo.png' })
  })

  it('delegates path operations to the narrow workspace API', async () => {
    await fsApi.openPathInSystem('notes/today.md')
    await fsApi.revealPathInSystem('notes/today.md')
    await fsApi.copyAbsolutePathToClipboard('notes/today.md')

    expect(runtime.workspace.openPathInSystem).toHaveBeenCalledWith('notes/today.md')
    expect(runtime.workspace.revealPathInSystem).toHaveBeenCalledWith('notes/today.md')
    expect(runtime.workspace.copyAbsolutePathToClipboard).toHaveBeenCalledWith('notes/today.md')
  })

  it('validates bounded text preview responses from the narrow workspace API', async () => {
    runtime.workspace.readTextPreview.mockResolvedValue({ content: 'hello', truncated: true })

    await expect(fsApi.readTextPreview('src/example.ts', 16_384)).resolves.toEqual({
      content: 'hello',
      truncated: true,
    })
    expect(runtime.workspace.readTextPreview).toHaveBeenCalledWith('src/example.ts', 16_384)

    runtime.workspace.readTextPreview.mockResolvedValueOnce({ content: 'hello', truncated: 'yes' })
    await expect(fsApi.readTextPreview('src/example.ts', 16_384)).rejects.toThrow()
  })
})
