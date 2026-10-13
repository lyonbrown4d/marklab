import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createWorkspaceDirectory,
  validateWorkspaceName,
} from '@electron/ipc/createWorkspaceDirectory'

let parent: string
beforeEach(async () => {
  parent = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-new-workspace-'))
})
afterEach(async () => {
  await fs.rm(parent, { recursive: true, force: true })
})

describe('workspace directory creation', () => {
  it('creates exactly one new directory inside the chosen parent', async () => {
    const created = await createWorkspaceDirectory(parent, 'Notes')
    expect(created).toBe(path.join(await fs.realpath(parent), 'Notes'))
    expect(await fs.readdir(created)).toEqual([])
  })
  it('rejects an existing folder and leaves its contents intact', async () => {
    const target = path.join(parent, 'Notes')
    await fs.mkdir(target)
    await fs.writeFile(path.join(target, 'keep.md'), 'keep')
    await expect(createWorkspaceDirectory(parent, 'Notes')).rejects.toThrow('already exists')
    expect(await fs.readFile(path.join(target, 'keep.md'), 'utf8')).toBe('keep')
  })
  it('rejects existing files and missing parents', async () => {
    await fs.writeFile(path.join(parent, 'Notes'), 'keep')
    await expect(createWorkspaceDirectory(parent, 'Notes')).rejects.toThrow('already exists')
    await expect(createWorkspaceDirectory(path.join(parent, 'missing'), 'Notes')).rejects.toThrow()
  })
  it.each([
    '',
    ' ',
    '.',
    '..',
    '../escape',
    'a/b',
    'a\\b',
    'CON',
    'nul.md',
    'name.',
    'name ',
    'a:bad',
    '\u0000',
    'x'.repeat(121),
  ])('rejects unsafe folder name %j', (name) => {
    expect(() => validateWorkspaceName(name)).toThrow()
  })
})
