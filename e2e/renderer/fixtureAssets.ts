import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'

export const createFixtureAssets = (target: (relative: string) => string) => {
  let generation = 0
  const capabilities = new Map<string, { path: string; expires: number }>()
  return {
    clear: () => {
      generation += 1
      capabilities.clear()
    },
    issue: async (relative: string) => {
      const issuedGeneration = generation
      const path = target(relative)
      if ((await fs.realpath(path)) !== path) throw new Error('Fixture asset cannot follow a link')
      const stat = await fs.stat(path)
      if (!stat.isFile() || stat.size > 1024 * 1024)
        throw new Error('Fixture asset exceeds its supported file bound')
      if (issuedGeneration !== generation)
        throw new Error('Fixture workspace changed during asset issue')
      if (capabilities.size >= 128) throw new Error('Fixture asset capability limit reached')
      const url = `marklab-asset://local/v1/${randomBytes(32).toString('base64url')}`
      const expires = Date.now() + 30 * 60 * 1000
      capabilities.set(url, { path, expires })
      return { url, expires_at_ms: expires }
    },
    read: async (url: string) => {
      const readGeneration = generation
      const capability = capabilities.get(url)
      if (!capability || capability.expires <= Date.now())
        throw new Error('Unknown or stale fixture asset capability')
      const stat = await fs.stat(capability.path)
      if (!stat.isFile() || stat.size > 1024 * 1024)
        throw new Error('Fixture asset exceeds its supported file bound')
      const bytes = await fs.readFile(capability.path)
      if (readGeneration !== generation || capabilities.get(url) !== capability)
        throw new Error('Unknown or stale fixture asset capability')
      return bytes
    },
  }
}
