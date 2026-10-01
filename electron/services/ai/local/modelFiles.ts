import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'

export const fileExistsWithSize = async (filePath: string, sizeBytes: number): Promise<boolean> => {
  try {
    return (await fs.stat(filePath)).size === sizeBytes
  } catch {
    return false
  }
}

export const sha256File = async (filePath: string): Promise<string> => {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

export const normalizeError = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.name === 'AbortError') return 'Download cancelled'
  if (error instanceof Error && error.message) return error.message.slice(0, 300)
  return fallback
}
