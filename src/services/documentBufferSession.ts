import { fsApi, type FsBufferSnapshot, type FsBufferSyncStatus } from '@/services/fsApi'

// A mounted editor owns this revision. Another editor's load must never refresh
// its compare-and-set precondition, including after an uncertain IPC failure.
export const createDocumentBufferSession = (workspace: string, path: string) => {
  let loaded: FsBufferSyncStatus | null = null
  let tail: Promise<unknown> = Promise.resolve()
  let failure: unknown = null
  let generation = 0
  return {
    identity: `${workspace.length}:${workspace}${path}`,
    seed: (snapshot: FsBufferSnapshot) => {
      if (snapshot.path !== path) throw new Error('Document snapshot belongs to another path')
      generation += 1
      loaded = {
        path,
        revision: snapshot.revision,
        dirty: snapshot.dirty,
        session_generation: snapshot.session_generation,
      }
      failure = null
    },
    save: (content: string, flush: boolean) => {
      const expectedGeneration = generation
      const operation = tail.then(async () => {
        if (expectedGeneration !== generation)
          throw new Error('Document was reloaded before saving')
        if (failure) throw failure
        if (!loaded) throw new Error('Load a versioned document before saving')
        const status = await fsApi.updateBuffer(path, content, loaded)
        if (expectedGeneration !== generation) throw new Error('Document was reloaded while saving')
        loaded = status
        if (!flush) return loaded
        await fsApi.flushBuffers()
        return { ...loaded, dirty: false }
      })
      tail = operation.catch((error: unknown) => {
        if (expectedGeneration === generation) failure = error
      })
      return operation
    },
  }
}
