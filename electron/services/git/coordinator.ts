import fs from 'node:fs/promises'
import path from 'node:path'

type CachedQuery = { expiresAt: number; generation: number; value: unknown }
type Canonicalize = (root: string) => Promise<string>

const canonicalPathKey = async (root: string): Promise<string> => {
  const resolved = path.resolve(root)
  const canonical = await fs.realpath(resolved).catch(() => resolved)
  const normalized = canonical.replaceAll('\\', '/')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

export class GitOperationCoordinator {
  private admissionTail: Promise<void> = Promise.resolve()
  private readonly mutationTails = new Map<string, Promise<void>>()
  private readonly cachedQueries = new Map<string, CachedQuery>()
  private readonly inFlightQueries = new Map<string, Promise<unknown>>()
  private readonly generations = new Map<string, number>()

  constructor(
    private readonly queryTtlMs = 700,
    private readonly canonicalize: Canonicalize = canonicalPathKey,
  ) {}

  async mutate<T>(root: string, work: () => Promise<T>): Promise<T> {
    const { key, run, tail } = await this.admit(() => this.prepareMutation(root, work))
    try {
      return await run
    } finally {
      await tail
      if (this.mutationTails.get(key) === tail) this.mutationTails.delete(key)
    }
  }

  async query<T>(root: string, name: string, load: () => Promise<T>): Promise<T> {
    const { request } = await this.admit(async () => {
      const key = await this.canonicalize(root)
      const queryKey = `${key}\0${name}`
      const existing = this.inFlightQueries.get(queryKey)
      if (existing) return { request: existing as Promise<T> }
      const mutation = this.mutationTails.get(key)
      const base = (async () => {
        await mutation
        const generation = this.generation(key)
        const cached = this.cachedQueries.get(queryKey)
        if (cached && cached.generation === generation && cached.expiresAt > Date.now()) {
          return cached.value as T
        }
        const value = await load()
        if (this.generation(key) === generation) {
          this.cachedQueries.set(queryKey, {
            expiresAt: Date.now() + this.queryTtlMs,
            generation,
            value,
          })
        }
        return value
      })()
      const request = base.finally(() => {
        if (this.inFlightQueries.get(queryKey) === request) {
          this.inFlightQueries.delete(queryKey)
        }
      })
      this.inFlightQueries.set(queryKey, request)
      return { request }
    })
    return request
  }

  async invalidate(root: string): Promise<void> {
    await this.admit(async () => {
      this.invalidateKey(await this.canonicalize(root))
    })
  }

  private admit<T>(setup: () => Promise<T>): Promise<T> {
    const admitted = this.admissionTail.then(setup, setup)
    this.admissionTail = admitted.then(
      () => undefined,
      () => undefined,
    )
    return admitted
  }

  private async prepareMutation<T>(
    root: string,
    work: () => Promise<T>,
  ): Promise<{ key: string; run: Promise<T>; tail: Promise<void> }> {
    const key = await this.canonicalize(root)
    const previous = this.mutationTails.get(key) ?? Promise.resolve()
    const queryPrefix = `${key}\0`
    const activeQueries = [...this.inFlightQueries]
      .filter(([queryKey]) => queryKey.startsWith(queryPrefix))
      .map(([, query]) => query)
    const ready = Promise.allSettled([previous, ...activeQueries])
    const run = ready.then(() => work())
    const tail = run.then(
      () => this.invalidateKey(key),
      () => this.invalidateKey(key),
    )
    this.mutationTails.set(key, tail)
    return { key, run, tail }
  }

  private generation(key: string): number {
    return this.generations.get(key) ?? 0
  }

  private invalidateKey(key: string): void {
    this.generations.set(key, this.generation(key) + 1)
    const prefix = `${key}\0`
    for (const queryKey of this.cachedQueries.keys()) {
      if (queryKey.startsWith(prefix)) this.cachedQueries.delete(queryKey)
    }
    for (const queryKey of this.inFlightQueries.keys()) {
      if (queryKey.startsWith(prefix)) this.inFlightQueries.delete(queryKey)
    }
  }
}
