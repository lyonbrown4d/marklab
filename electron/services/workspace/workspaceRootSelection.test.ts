import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import type { FsStateData } from '@electron/services/workspace/types'
import {
  selectSingleFileWorkspace,
  selectWorkspaceRoot,
} from '@electron/services/workspace/workspaceRootSelection'
const roots: string[] = []
const fixture = async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'marklab-root-select-'))
  roots.push(root)
  const state: FsStateData = {
    rootKind: 'external',
    rootPath: root,
    internalRoot: path.join(root, 'default'),
    singleFile: null,
  }
  return { root, state }
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

describe('workspace root selection', () => {
  it('validates root input and preserves an already selected external root', async () => {
    const f = await fixture()
    await expect(selectWorkspaceRoot(f.state, { path: 1 })).rejects.toThrow('string or null')
    await expect(selectWorkspaceRoot(f.state, path.join(f.root, 'missing'))).rejects.toThrow(
      'not a directory',
    )
    expect(await selectWorkspaceRoot(f.state, f.root)).toBeNull()
    const other = path.join(f.root, 'other')
    await fs.mkdir(other)
    expect(await selectWorkspaceRoot(f.state, { path: other })).toMatchObject({
      rootKind: 'external',
      rootPath: other,
    })
  })

  it('prepares a new internal root and preserves user content on later selections', async () => {
    const f = await fixture()
    const selected = await selectWorkspaceRoot(f.state, null)
    expect(selected).toMatchObject({ rootKind: 'internal', rootPath: f.state.internalRoot })
    expect(await selectWorkspaceRoot(selected!, undefined)).toBeNull()
    await fs.writeFile(path.join(f.state.internalRoot, 'Untitled.md'), '# My edit')
    await selectWorkspaceRoot(f.state, '')
    expect(await fs.readFile(path.join(f.state.internalRoot, 'Untitled.md'), 'utf8')).toBe(
      '# My edit',
    )
  })

  it('validates single documents and preserves a selected document', async () => {
    const f = await fixture()
    await expect(
      selectSingleFileWorkspace(f.state, { path: path.join(f.root, 'missing.md') }),
    ).rejects.toThrow('not a file')
    await expect(selectSingleFileWorkspace(f.state, { path: f.root })).rejects.toThrow('not a file')
    const unsupported = path.join(f.root, 'unsupported.xyz')
    await fs.writeFile(unsupported, '')
    await expect(selectSingleFileWorkspace(f.state, { path: unsupported })).rejects.toThrow(
      'not supported',
    )
    const document = path.join(f.root, 'note.md')
    await fs.writeFile(document, '# Note')
    const selected = await selectSingleFileWorkspace(f.state, { path: document })
    expect(selected).toMatchObject({ rootKind: 'single', rootPath: document, singleFile: document })
    expect(await selectSingleFileWorkspace(selected!, { path: document })).toBeNull()
  })
})
