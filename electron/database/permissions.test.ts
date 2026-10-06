import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { LocalDatabaseService } from '@electron/database/service'

const roots: string[] = []
const services: LocalDatabaseService[] = []

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.close()))
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

describe('local database permissions', () => {
  it('restricts the storage directory and database file on non-Windows platforms', async () => {
    const root = await createRoot()
    const chmod = vi.fn(async () => undefined)
    const service = new LocalDatabaseService({ chmod, platform: 'linux', userDataPath: root })
    services.push(service)

    await service.initialize()

    expect(chmod).toHaveBeenCalledWith(path.join(root, 'storage'), 0o700)
    expect(chmod).toHaveBeenCalledWith(path.join(root, 'storage', 'marklab.sqlite3'), 0o600)
  })

  it('does not fail startup when chmod is unsupported on Windows', async () => {
    const root = await createRoot()
    const chmod = vi.fn(async () => {
      throw new Error('chmod unsupported')
    })
    const service = new LocalDatabaseService({ chmod, platform: 'win32', userDataPath: root })
    services.push(service)

    await expect(service.initialize()).resolves.toBeUndefined()
    expect(service.isOpen).toBe(true)
  })
})

const createRoot = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-permissions-'))
  roots.push(root)
  return root
}
