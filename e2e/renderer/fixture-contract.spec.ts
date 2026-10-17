import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
// eslint-disable-next-line no-restricted-imports -- This exercises the test fixture, not a native backend substitute.
import { createFixtureBackend } from './fixtureBackend.js'

test('fixture preserves UTF-16 patches, revisions, flush and workspace isolation', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-renderer-fixture-contract-'))
  try {
    const roots = await Promise.all(
      ['first', 'second'].map(async (name) => {
        const root = path.join(directory, name)
        await fs.mkdir(root)
        await fs.writeFile(path.join(root, 'same.md'), `😀 ${name}\n`)
        return root
      }),
    )
    const backend = await createFixtureBackend(roots[0], 'same.md', roots)
    const initial = await backend.buffers.snapshot('same.md')
    expect(initial.content).toBe('😀 first\n')
    const request = {
      path: 'same.md',
      base_revision: 0,
      session_generation: 1,
      update: { kind: 'patch', changes: [{ offset: 3, delete_length: 5, insert_text: 'changed' }] },
    }
    expect(await backend.buffers.apply(request)).toMatchObject({
      kind: 'applied',
      revision: 1,
      dirty: true,
    })
    expect(await backend.buffers.apply(request)).toMatchObject({
      kind: 'resync_required',
      revision: 1,
    })
    expect(await backend.buffers.flush()).toBe(1)
    expect(await fs.readFile(path.join(roots[0], 'same.md'), 'utf8')).toBe('😀 changed\n')
    const capability = await backend.assets.issue('same.md')
    expect((await backend.assets.read(capability.url)).toString('utf8')).toBe('😀 changed\n')
    await backend.bind(roots[1], 'same.md')
    await expect(backend.assets.read(capability.url)).rejects.toThrow('Unknown or stale')
    expect(await backend.buffers.apply({ ...request, base_revision: 1 })).toMatchObject({
      kind: 'session_mismatch',
    })
    expect((await backend.buffers.snapshot('same.md')).content).toBe('😀 second\n')
    await expect(backend.invoke('unimplemented_native_command', {})).rejects.toThrow(
      'Unimplemented renderer fixture command',
    )
    expect(() => backend.buffers.target('../outside.md')).toThrow('escaped')
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})
