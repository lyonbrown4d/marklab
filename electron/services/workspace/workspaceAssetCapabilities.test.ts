import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { WorkspaceAssetCapabilities } from '@electron/services/workspace/workspaceAssetCapabilities.js'
import { readWorkspaceAssetBytes } from '@electron/services/workspace/workspaceAssetBytes.js'

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
  const readBytes = (value: unknown) =>
    readWorkspaceAssetBytes(value, {
      resolveAssetUrl: (url) => assets.resolveUrl(url),
    })
  return { assets, readBytes, root, temporaryRoot }
}

describe('workspace preview asset capability contract', () => {
  it('reads bytes only through a capability issued for a workspace-relative asset', async () => {
    const { assets, readBytes, root } = await createAssets()
    await fs.writeFile(path.join(root, 'brief.pdf'), '%PDF')
    const capability = await assets.issue({ path: 'brief.pdf' })
    expect(capability.url).toMatch(/^marklab-asset:\/\/local\/v1\/[A-Za-z0-9_-]{43}$/)
    const result = await readBytes({ asset_url: capability.url })
    expect(new TextDecoder().decode(result.bytes)).toBe('%PDF')
    expect(result).toMatchObject({ media_type: 'application/pdf', size_bytes: 4 })
  })

  it('rejects an existing asset outside the workspace boundary', async () => {
    const { assets, temporaryRoot } = await createAssets()
    await fs.writeFile(path.join(temporaryRoot, 'outside.pdf'), '%PDF')
    await expect(assets.issue({ path: '../outside.pdf' })).rejects.toThrow('Asset not found')
  })

  it('does not accept the obsolete direct-path byte-read request', async () => {
    const { readBytes, root } = await createAssets()
    const assetPath = path.join(root, 'brief.pdf')
    await fs.writeFile(assetPath, '%PDF')
    await expect(readBytes({ path: assetPath })).rejects.toThrow('Asset not found')
  })

  it('rejects a previously valid capability after revocation', async () => {
    const { assets, readBytes, root } = await createAssets()
    await fs.writeFile(path.join(root, 'brief.pdf'), '%PDF')
    const capability = await assets.issue({ path: 'brief.pdf' })
    assets.revoke()
    await expect(readBytes({ asset_url: capability.url })).rejects.toThrow('Asset not found')
  })
})
