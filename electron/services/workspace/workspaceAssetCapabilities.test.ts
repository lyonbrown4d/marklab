import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { WorkspaceAssetCapabilities } from '@electron/services/workspace/workspaceAssetCapabilities'

const roots: string[] = []
const capabilities: WorkspaceAssetCapabilities[] = []
afterEach(async () => {
  for (const assets of capabilities.splice(0)) assets.dispose()
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

const createAssets = async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(tmpdir(), 'marklab-asset-capability-'))
  roots.push(temporaryRoot)
  const root = path.join(temporaryRoot, 'workspace')
  await fs.mkdir(root)
  const assets = new WorkspaceAssetCapabilities(() => ({
    rootKind: 'external',
    rootPath: root,
    internalRoot: root,
    singleFile: null,
  }))
  capabilities.push(assets)
  return { assets, root, temporaryRoot }
}

describe('workspace preview asset capability contract', () => {
  it('reads bytes only through a capability issued for a workspace-relative asset', async () => {
    const { assets, root } = await createAssets()
    await fs.writeFile(path.join(root, 'brief.pdf'), '%PDF')
    const capability = await assets.issue({ path: 'brief.pdf' })
    expect(capability.url).toMatch(/^marklab-asset:\/\/local\/v1\/[A-Za-z0-9_-]{43}$/)
    const opened = await assets.resolveUrl(capability.url)
    expect(opened).toMatchObject({ mediaType: 'application/pdf', sizeBytes: 4 })
    expect(await new Response(opened?.createWebStream(null)).text()).toBe('%PDF')
  })

  it('rejects an existing asset outside the workspace boundary', async () => {
    const { assets, temporaryRoot } = await createAssets()
    await fs.writeFile(path.join(temporaryRoot, 'outside.pdf'), '%PDF')
    await expect(assets.issue({ path: '../outside.pdf' })).rejects.toThrow('Asset not found')
  })

  it('rejects a previously valid capability after revocation', async () => {
    const { assets, root } = await createAssets()
    await fs.writeFile(path.join(root, 'brief.pdf'), '%PDF')
    const capability = await assets.issue({ path: 'brief.pdf' })
    assets.revoke()
    await expect(assets.resolveUrl(capability.url)).resolves.toBeNull()
  })
})
