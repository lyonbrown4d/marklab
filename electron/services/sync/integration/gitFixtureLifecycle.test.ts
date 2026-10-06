import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  createRemoteFixture,
  removeRemoteFixture,
  type RemoteFixture,
} from '@electron/services/git/testSupport'

describe('Git remote fixture lifecycle', () => {
  it('removes its temporary root when repository creation fails', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-git-remote-'))
    const commandFailure = new Error('git failed')
    let unexpectedFixture: RemoteFixture | undefined
    try {
      const outcome = await createRemoteFixture({
        command: async () => {
          throw commandFailure
        },
        createRoot: async () => root,
      }).then(
        (fixture) => ({ fixture }),
        (error: unknown) => ({ error }),
      )
      if ('fixture' in outcome) unexpectedFixture = outcome.fixture

      expect(outcome).toEqual({ error: commandFailure })
      await expect(fs.stat(root)).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await fs.rm(root, { force: true, recursive: true })
      if (unexpectedFixture) await removeRemoteFixture(unexpectedFixture)
    }
  })
})
