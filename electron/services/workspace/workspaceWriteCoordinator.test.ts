import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  canonicalWorkspaceAbsoluteKey,
  canonicalWorkspaceRelativeKey,
  canonicalWorkspaceWriteIdentity,
  commitWorkspaceWrite,
  createWorkspaceWriteOwner,
  releaseWorkspaceWriteOwner,
  replaceWorkspaceWriteClaims,
  runWorkspacePathMutation,
  WorkspaceWriteConflictError,
  writeWorkspaceFileAtomically,
} from '@electron/services/workspace/workspaceWriteCoordinator.js'

let root = ''
const owners: string[] = []
const owner = () => {
  const id = createWorkspaceWriteOwner()
  owners.push(id)
  return id
}
beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-write-identity-'))
})
afterEach(() => {
  for (const id of owners.splice(0)) releaseWorkspaceWriteOwner(id)
})
afterAll(async () => {
  if (!root) return
  const resolved = path.resolve(root)
  if (
    path.dirname(resolved) !== path.resolve(os.tmpdir()) ||
    !path.basename(resolved).startsWith('marklab-write-identity-')
  ) {
    throw new Error('Refusing to remove a path outside the test fixture')
  }
  await fs.rm(resolved, { recursive: true, force: true })
})

describe('workspace write identity compatibility', () => {
  it('normalizes relative and absolute path aliases through the existing exports', () => {
    expect(canonicalWorkspaceRelativeKey('./docs\\Draft.md')).toBe('docs/Draft.md')
    expect(canonicalWorkspaceAbsoluteKey(path.join(root, 'docs', '..', 'Draft.md'))).toBe(
      canonicalWorkspaceAbsoluteKey(path.join(root, 'Draft.md')),
    )
  })

  it.each(['', '.', '..', '../Draft.md', '/Draft.md'])(
    'rejects invalid relative key %j',
    (value) => {
      expect(() => canonicalWorkspaceRelativeKey(value)).toThrow('Invalid workspace-relative path')
    },
  )

  it('resolves hard links to the same file identity', async () => {
    const original = path.join(root, 'linked-original.md')
    const alias = path.join(root, 'linked-alias.md')
    await fs.writeFile(original, 'original')
    await fs.link(original, alias)
    const originalIdentity = await canonicalWorkspaceWriteIdentity(original)
    const aliasIdentity = await canonicalWorkspaceWriteIdentity(alias)
    expect(aliasIdentity.key).toBe(originalIdentity.key)
    expect(originalIdentity.writePath).toBe(await fs.realpath(original))
  })

  it('resolves missing descendants consistently without creating them', async () => {
    const target = path.join(root, 'missing', 'Nested.md')
    const identity = await canonicalWorkspaceWriteIdentity(target)
    expect(identity.key).toMatch(/^missing:/)
    expect(identity.writePath).toBe(path.join(await fs.realpath(root), 'missing', 'Nested.md'))
    expect(
      await canonicalWorkspaceWriteIdentity(
        path.join(root, 'unused', '..', 'missing', 'Nested.md'),
      ),
    ).toEqual(identity)
    await expect(fs.stat(target)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

describe('workspace coordinated writes', () => {
  it('writes atomically without leaving temporary files', async () => {
    const target = path.join(root, 'atomic', 'Draft.md')
    await writeWorkspaceFileAtomically(target, 'saved')
    expect(await fs.readFile(target, 'utf8')).toBe('saved')
    expect(await fs.readdir(path.dirname(target))).toEqual(['Draft.md'])
  })

  it('preserves external changes instead of overwriting a stale baseline', async () => {
    const target = path.join(root, 'external.md')
    await fs.writeFile(target, 'external')
    const write = vi.fn()
    await expect(
      commitWorkspaceWrite({
        absolutePath: target,
        baselineContent: 'original',
        content: 'local',
        ownerId: owner(),
        recordKey: 'external.md',
        write,
      }),
    ).rejects.toBeInstanceOf(WorkspaceWriteConflictError)
    expect(write).not.toHaveBeenCalled()
    expect(await fs.readFile(target, 'utf8')).toBe('external')
  })

  it('protects other unsaved buffers and permits saving after their claims are released', async () => {
    const target = path.join(root, 'claimed.md')
    await fs.writeFile(target, 'original')
    const other = owner()
    replaceWorkspaceWriteClaims(other, [
      {
        absolutePath: target,
        baselineContent: 'original',
        content: 'other draft',
        recordKey: 'other',
      },
    ])
    const commit = {
      absolutePath: target,
      baselineContent: 'original',
      content: 'saved',
      ownerId: owner(),
      recordKey: 'claimed.md',
      write: (writePath: string) => writeWorkspaceFileAtomically(writePath, 'saved'),
    }
    await expect(commitWorkspaceWrite(commit)).rejects.toBeInstanceOf(WorkspaceWriteConflictError)
    expect(await fs.readFile(target, 'utf8')).toBe('original')
    releaseWorkspaceWriteOwner(other)
    await commitWorkspaceWrite(commit)
    expect(await fs.readFile(target, 'utf8')).toBe('saved')
  })

  it('protects claimed descendants during a folder mutation', async () => {
    const directory = path.join(root, 'protected')
    const target = path.join(directory, 'Draft.md')
    await fs.mkdir(directory)
    await fs.writeFile(target, 'original')
    const bufferOwner = owner()
    replaceWorkspaceWriteClaims(bufferOwner, [
      {
        absolutePath: target,
        baselineContent: 'original',
        content: 'local',
        recordKey: 'Draft.md',
      },
    ])
    const work = vi.fn().mockResolvedValue('finished')
    const mutation = {
      ownerId: owner(),
      paths: [{ absolutePath: directory, includeDescendants: true }],
      work,
    }
    await expect(runWorkspacePathMutation(mutation)).rejects.toBeInstanceOf(
      WorkspaceWriteConflictError,
    )
    expect(work).not.toHaveBeenCalled()
    releaseWorkspaceWriteOwner(bufferOwner)
    await expect(runWorkspacePathMutation(mutation)).resolves.toBe('finished')
    expect(work).toHaveBeenCalledTimes(1)
  })

  it('serializes writes and checks the next baseline after the previous write finishes', async () => {
    const target = path.join(root, 'serial.md')
    await fs.writeFile(target, 'first')
    const order: string[] = []
    const ownerId = owner()
    const first = commitWorkspaceWrite({
      absolutePath: target,
      baselineContent: 'first',
      content: 'second',
      ownerId,
      recordKey: 'serial.md',
      write: async (writePath) => {
        order.push('second')
        await writeWorkspaceFileAtomically(writePath, 'second')
      },
    })
    const second = commitWorkspaceWrite({
      absolutePath: target,
      baselineContent: 'second',
      content: 'third',
      ownerId,
      recordKey: 'serial.md',
      write: async (writePath) => {
        order.push('third')
        await writeWorkspaceFileAtomically(writePath, 'third')
      },
    })
    await first
    await second
    expect(order).toEqual(['second', 'third'])
    expect(await fs.readFile(target, 'utf8')).toBe('third')
  })
})
