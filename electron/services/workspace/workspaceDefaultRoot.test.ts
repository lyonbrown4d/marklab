import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ensureDefaultFile } from '@electron/services/workspace/workspaceDefaultRoot'

const roots: string[] = []
const fixture = async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'marklab-default-root-'))
  roots.push(root)
  return root
}
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

describe('default workspace preparation', () => {
  it('creates a missing root and one empty default document', async () => {
    const root = path.join(await fixture(), 'workspace')
    await ensureDefaultFile(root)
    expect(await fs.readFile(path.join(root, 'Untitled.md'), 'utf8')).toBe('')
  })

  it('keeps nested Markdown in every visible directory, including dependency directories', async () => {
    const root = await fixture()
    await fs.mkdir(path.join(root, 'node_modules', 'notes'), { recursive: true })
    await fs.writeFile(path.join(root, 'node_modules', 'notes', 'plan.MD'), '# Existing')
    await ensureDefaultFile(root)
    await expect(fs.access(path.join(root, 'Untitled.md'))).rejects.toThrow()
  })

  it('ignores hidden documents and does not follow symlinks', async () => {
    const root = await fixture()
    const outside = await fixture()
    await fs.mkdir(path.join(root, '.hidden'))
    await fs.writeFile(path.join(root, '.hidden', 'note.md'), '# Hidden')
    await fs.writeFile(path.join(outside, 'note.md'), '# Outside')
    await fs.symlink(outside, path.join(root, 'linked'), 'dir')
    await ensureDefaultFile(root)
    expect(await fs.readFile(path.join(root, 'Untitled.md'), 'utf8')).toBe('')
  })

  it('shares normalized concurrent root preparation but rechecks later selections', async () => {
    const root = await fixture()
    const readdir = vi.spyOn(fs, 'readdir')
    const first = ensureDefaultFile(root)
    expect(ensureDefaultFile(path.join(root, 'nested', '..'))).toBe(first)
    await first
    expect(readdir).toHaveBeenCalledTimes(1)
    await fs.unlink(path.join(root, 'Untitled.md'))
    await ensureDefaultFile(root)
    expect(readdir).toHaveBeenCalledTimes(2)
    expect(await fs.readFile(path.join(root, 'Untitled.md'), 'utf8')).toBe('')
  })

  it('does not overwrite a document published while discovery is in flight', async () => {
    const root = await fixture()
    const readdir = fs.readdir.bind(fs)
    vi.spyOn(fs, 'readdir').mockImplementationOnce(async (...args) => {
      const entries = await readdir(...args)
      await fs.writeFile(path.join(root, 'Untitled.md'), '# User edit')
      return entries
    })
    await ensureDefaultFile(root)
    expect(await fs.readFile(path.join(root, 'Untitled.md'), 'utf8')).toBe('# User edit')
  })

  it('keeps guide documents and user edits unchanged', async () => {
    const root = await fixture()
    await fs.mkdir(path.join(root, 'User Guide'))
    await fs.writeFile(path.join(root, 'Home.md'), '# My home')
    await fs.writeFile(path.join(root, 'User Guide', 'Start.md'), '# My guide')
    await ensureDefaultFile(root)
    expect(await fs.readFile(path.join(root, 'Home.md'), 'utf8')).toBe('# My home')
    expect(await fs.readFile(path.join(root, 'User Guide', 'Start.md'), 'utf8')).toBe('# My guide')
    await expect(fs.access(path.join(root, 'Untitled.md'))).rejects.toThrow()
  })

  it('retries after failed discovery and propagates unexpected write failures', async () => {
    const root = await fixture()
    vi.spyOn(fs, 'readdir').mockRejectedValueOnce(new Error('listing failed'))
    await expect(ensureDefaultFile(root)).rejects.toThrow('listing failed')
    vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('write failed'))
    await expect(ensureDefaultFile(root)).rejects.toThrow('write failed')
    await ensureDefaultFile(root)
    expect(await fs.readFile(path.join(root, 'Untitled.md'), 'utf8')).toBe('')
  })
})
