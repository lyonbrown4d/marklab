import type {
  BufferRecord,
  WorkspaceBufferStoreOptions,
} from '@electron/services/workspace/workspaceBufferTypes.js'
import {
  canonicalWorkspaceWriteIdentity,
  commitWorkspaceWrite,
  writeWorkspaceFileAtomically,
} from '@electron/services/workspace/workspaceWriteCoordinator.js'

type FlushEntry = { key: string; record: BufferRecord }
type FlushContext = {
  records: Map<string, BufferRecord>
  ownerId: string
  options: WorkspaceBufferStoreOptions
  emit: (record: BufferRecord) => void
  syncWriteClaims: () => void
}

const writeEntry = async (entry: FlushEntry, context: FlushContext): Promise<void> => {
  const { records, ownerId, options, emit } = context
  const snapshot = entry.record
  const committed = await commitWorkspaceWrite({
    absolutePath: snapshot.target.absolutePath,
    baselineContent: snapshot.baselineContent,
    content: snapshot.content,
    ownerId,
    recordKey: entry.key,
    write: (writePath) =>
      options.writeFile({
        absolutePath: snapshot.target.absolutePath,
        baselineContent: snapshot.baselineContent,
        content: snapshot.content,
        relativePath: snapshot.relativePath,
        state: snapshot.target.state,
        writeWithNode: async () => {
          options.markOwnWrite(writePath)
          await writeWorkspaceFileAtomically(writePath, snapshot.content)
        },
      }),
  })
  while (true) {
    const current = records.get(entry.key)
    if (!current) return
    const currentIdentity = await canonicalWorkspaceWriteIdentity(current.target.absolutePath)
    if (records.get(entry.key) !== current) continue
    if (currentIdentity.key !== committed.identityKey) return
    current.baselineContent = snapshot.content
    current.dirty = current.content !== snapshot.content
    emit(current)
    return
  }
}

export const flushWorkspaceBufferPass = async (context: FlushContext): Promise<void> => {
  const entries: FlushEntry[] = [...context.records]
    .filter(([, record]) => record.dirty)
    .map(([key, record]) => ({ key, record: { ...record, target: { ...record.target } } }))
  const results = await Promise.allSettled(entries.map((entry) => writeEntry(entry, context)))
  const savedPaths: string[] = []
  const errors: unknown[] = []
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') savedPaths.push(entries[index].record.relativePath)
    else errors.push(result.reason)
  })
  context.syncWriteClaims()
  if (savedPaths.length > 0) {
    try {
      context.options.onBuffersFlushed([...new Set(savedPaths)])
    } catch (error) {
      errors.push(error)
    }
    try {
      context.options.scheduleSnapshotChanged()
    } catch (error) {
      errors.push(error)
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Failed to save ' + errors.length + ' workspace buffer(s)')
  }
}
