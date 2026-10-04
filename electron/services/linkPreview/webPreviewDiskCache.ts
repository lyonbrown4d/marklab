import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import pLimit from 'p-limit'

const DEFAULT_MAX_BYTES = 200 * 1024 * 1024
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000

type CacheEntry = { modifiedAt: number; path: string; size: number }

export type WebPreviewCacheContract = {
  get(url: string): Promise<Uint8Array | null>
  set(url: string, bytes: Uint8Array): Promise<void>
}

export class WebPreviewDiskCache implements WebPreviewCacheContract {
  private readonly maxBytes: number
  private readonly root: string
  private readonly ttlMs: number

  constructor(options: { maxBytes?: number; root: string; ttlMs?: number }) {
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
    this.root = options.root
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
  }

  async get(url: string): Promise<Uint8Array | null> {
    const file = this.fileFor(url)
    try {
      const stats = await fs.stat(file)
      if (Date.now() - stats.mtimeMs > this.ttlMs) {
        await fs.rm(file, { force: true })
        return null
      }
      const bytes = await fs.readFile(file)
      const now = new Date()
      await fs.utimes(file, now, now).catch(() => undefined)
      return new Uint8Array(bytes)
    } catch (error) {
      if (isMissingFile(error)) return null
      await fs.rm(file, { force: true }).catch(() => undefined)
      return null
    }
  }

  async set(url: string, bytes: Uint8Array): Promise<void> {
    await fs.mkdir(this.root, { recursive: true })
    await fs.writeFile(this.fileFor(url), bytes)
    await this.prune()
  }

  private fileFor(url: string): string {
    const normalized = new URL(url).toString()
    const key = createHash('sha256').update(normalized).digest('hex')
    return path.join(this.root, `${key}.jpg`)
  }

  private async prune(): Promise<void> {
    const files = await fs.readdir(this.root, { withFileTypes: true })
    const limit = pLimit(8)
    const candidates = files.filter((file) => file.isFile() && file.name.endsWith('.jpg'))
    const entries = (
      await Promise.all(
        candidates.map((file) =>
          limit(async (): Promise<CacheEntry | null> => {
            const filePath = path.join(this.root, file.name)
            try {
              const stats = await fs.stat(filePath)
              return { modifiedAt: stats.mtimeMs, path: filePath, size: stats.size }
            } catch {
              return null
            }
          }),
        ),
      )
    ).filter((entry): entry is CacheEntry => Boolean(entry))

    entries.sort((left, right) => left.modifiedAt - right.modifiedAt)
    let total = entries.reduce((sum, entry) => sum + entry.size, 0)
    for (const entry of entries) {
      const expired = Date.now() - entry.modifiedAt > this.ttlMs
      if (!expired && total <= this.maxBytes) break
      await fs.rm(entry.path, { force: true })
      total -= entry.size
    }
  }
}

const isMissingFile = (error: unknown): boolean =>
  Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
