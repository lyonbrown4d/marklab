import fs from 'node:fs'
import path from 'node:path'

const schemePattern = /^[a-z][a-z\d+.-]*:/i

export type ValidatedPath =
  | {
      ok: true
      path: string
    }
  | {
      ok: false
      error: string
    }

export function validateExistingLocalPath(value: unknown): ValidatedPath {
  if (typeof value !== 'string') {
    return { ok: false, error: 'Path must be a string.' }
  }

  const input = value.trim()
  if (!input) {
    return { ok: false, error: 'Path is required.' }
  }

  if (input.includes('\0')) {
    return { ok: false, error: 'Path contains invalid characters.' }
  }

  if (schemePattern.test(input) && !path.win32.isAbsolute(input)) {
    return { ok: false, error: 'Only local filesystem paths are allowed.' }
  }

  const resolvedPath = path.resolve(input)
  if (!fs.existsSync(resolvedPath)) {
    return { ok: false, error: 'Path does not exist.' }
  }

  return { ok: true, path: resolvedPath }
}
