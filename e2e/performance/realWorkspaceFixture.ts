import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import pLimit from 'p-limit'

const excluded = new Set(['.git', '.venv', 'node_modules', 'target', 'dist', '__pycache__'])
export type WorkspaceFile = { path: string; bytes: number; sha256: string }
export type RealWorkspace = { source: string; files: WorkspaceFile[]; bytes: number }

export const snapshotWorkspace = async (source: string): Promise<RealWorkspace> => {
  if (!path.isAbsolute(source)) throw new Error('Performance source must be an absolute path')
  const root = await fs.realpath(source)
  const paths: string[] = []
  const directories = ['']
  // Directory enumeration has no recursive bulk API with symlink exclusion.
  // Walk each directory once; file reads are bounded and each file is read once.
  for (const parent of directories) {
    const entries = await fs.readdir(path.join(root, parent), { withFileTypes: true })
    for (const entry of entries) {
      if (excluded.has(entry.name) || entry.isSymbolicLink()) continue
      const relative = path.join(parent, entry.name)
      if (entry.isDirectory()) directories.push(relative)
      else if (entry.isFile()) paths.push(relative)
    }
  }
  const limit = pLimit(4)
  const files = await Promise.all(
    paths.sort().map((relative) =>
      limit(async () => {
        const hash = createHash('sha256')
        let bytes = 0
        const stream = createReadStream(path.join(root, relative))
        for await (const chunk of stream as AsyncIterable<Buffer>) {
          bytes += chunk.length
          hash.update(chunk)
        }
        return { path: relative.split(path.sep).join('/'), bytes, sha256: hash.digest('hex') }
      }),
    ),
  )
  return { source: root, files, bytes: files.reduce((total, file) => total + file.bytes, 0) }
}

export const copyPerformanceWorkspace = async (source: string, destination: string) => {
  const snapshot = await snapshotWorkspace(source)
  await fs.mkdir(destination)
  // Copy the enumerated regular files only; source scripts are never executed.
  const limit = pLimit(4)
  await Promise.all(
    snapshot.files.map((file) =>
      limit(async () => {
        const target = path.join(destination, file.path)
        await fs.mkdir(path.dirname(target), { recursive: true })
        await fs.copyFile(path.join(snapshot.source, file.path), target)
      }),
    ),
  )
  return snapshot
}
