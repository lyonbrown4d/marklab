import fs from 'node:fs/promises'
import path from 'node:path'
import { fsBufferUpdateRequestSchema, type FsBufferSnapshot } from '@/services/fsBufferSchemas'

const statusOf = ({ path, revision, dirty, session_generation }: FsBufferSnapshot) => ({
  path,
  revision,
  dirty,
  session_generation,
})

export const createFixtureBuffers = (root: () => string, generation: () => number) => {
  const buffers = new Map<string, FsBufferSnapshot>()
  const target = (relative: string) => {
    const resolved = path.resolve(root(), relative)
    const confined = path.relative(root(), resolved)
    if (
      !relative ||
      path.isAbsolute(relative) ||
      confined.startsWith('..') ||
      path.isAbsolute(confined)
    ) {
      throw new Error('Renderer fixture path escaped its temporary workspace')
    }
    return resolved
  }
  const snapshot = async (relative: string): Promise<FsBufferSnapshot> => {
    const cached = buffers.get(relative)
    if (cached) return cached
    const value = {
      path: relative,
      content: await fs.readFile(target(relative), 'utf8'),
      revision: 0,
      dirty: false,
      session_generation: generation(),
    }
    buffers.set(relative, value)
    return value
  }
  return {
    clear: () => buffers.clear(),
    snapshot,
    target,
    status: async (relative: string) => {
      return statusOf(await snapshot(relative))
    },
    apply: async (input: unknown) => {
      const request = fsBufferUpdateRequestSchema.parse(input)
      if (request.session_generation !== generation())
        return { kind: 'session_mismatch', path: request.path, session_generation: generation() }
      const buffer = await snapshot(request.path)
      if (request.base_revision !== buffer.revision)
        return {
          kind: 'resync_required',
          path: request.path,
          revision: buffer.revision,
          session_generation: generation(),
        }
      if (request.update.kind === 'snapshot') buffer.content = request.update.content
      else
        for (const change of [...request.update.changes].reverse()) {
          if (change.offset + change.delete_length > buffer.content.length)
            throw new Error('Fixture patch exceeds document bounds')
          buffer.content =
            buffer.content.slice(0, change.offset) +
            change.insert_text +
            buffer.content.slice(change.offset + change.delete_length)
        }
      buffer.revision += 1
      buffer.dirty = true
      return { kind: 'applied', ...statusOf(buffer) }
    },
    flush: async () => {
      let flushed = 0
      for (const buffer of buffers.values()) {
        if (!buffer.dirty) continue
        await fs.writeFile(target(buffer.path), buffer.content, 'utf8')
        buffer.dirty = false
        flushed += 1
      }
      return flushed
    },
  }
}
