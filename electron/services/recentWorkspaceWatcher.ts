import fs, { type Stats } from 'node:fs'

const WATCH_INTERVAL_MS = 1_000
const CHANGE_DEBOUNCE_MS = 75

export class RecentWorkspaceWatcher {
  private readonly listeners = new Set<() => void>()
  private readonly watched = new Map<string, (current: Stats, previous: Stats) => void>()
  private paths: string[] = []
  private pendingChange: ReturnType<typeof setTimeout> | null = null

  subscribe(paths: string[], listener: () => void): () => void {
    this.listeners.add(listener)
    try {
      this.setPaths(paths)
    } catch (error) {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.stop()
      throw error
    }
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.stop()
    }
  }

  setPaths(paths: string[]): void {
    const changed = JSON.stringify(paths) !== JSON.stringify(this.paths)
    this.paths = paths
    if (this.listeners.size === 0) return
    const next = new Set(paths.filter((path) => !path.includes('\0')))
    for (const [path, callback] of this.watched) {
      if (next.has(path)) continue
      fs.unwatchFile(path, callback)
      this.watched.delete(path)
    }
    for (const path of next) {
      if (this.watched.has(path)) continue
      const callback = (current: Stats, previous: Stats) => {
        if (!this.watched.has(path)) return
        // Root metadata only: never recurse through workspace contents.
        if (
          current.ino !== previous.ino ||
          current.dev !== previous.dev ||
          current.nlink !== previous.nlink ||
          current.mode !== previous.mode ||
          current.ctimeMs !== previous.ctimeMs
        )
          this.notify()
      }
      this.watched.set(path, callback)
      // Metadata polling also detects recreation of missing paths and unavailable mounts.
      // At most eight history roots are watched, shared by all subscribing windows.
      fs.watchFile(path, { persistent: false, interval: WATCH_INTERVAL_MS }, callback)
    }
    if (changed) this.notify()
  }

  private notify(): void {
    if (this.pendingChange) return
    this.pendingChange = setTimeout(() => {
      this.pendingChange = null
      for (const listener of this.listeners) listener()
    }, CHANGE_DEBOUNCE_MS)
  }

  private stop(): void {
    for (const [path, callback] of this.watched) fs.unwatchFile(path, callback)
    this.watched.clear()
    if (this.pendingChange) clearTimeout(this.pendingChange)
    this.pendingChange = null
  }
}
