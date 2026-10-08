import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { resolveWorkspacePath } from '@electron/services/workspace/path'
import type { FsStateData } from '@electron/services/workspace/types'

const singleFileState = (singleFile: string): FsStateData => ({
  internalRoot: path.dirname(singleFile),
  rootKind: 'single',
  rootPath: singleFile,
  singleFile,
})

describe('single-file workspace path resolution', () => {
  it('matches the opened filename case-insensitively on Windows', () => {
    const openedFile = 'C:\\Notes\\ReadMe.md'

    expect(resolveWorkspacePath(singleFileState(openedFile), 'readme.md', 'win32')).toBe(
      path.resolve(openedFile),
    )
  })

  it.each(['darwin', 'linux'] as const)(
    'keeps filename matching case-sensitive on %s',
    (platform) => {
      const state = singleFileState('/notes/ReadMe.md')

      expect(() => resolveWorkspacePath(state, 'readme.md', platform)).toThrow(
        'Single-file mode only allows operations on the opened file',
      )
      expect(resolveWorkspacePath(state, 'ReadMe.md', platform)).toBe(
        path.resolve('/notes/ReadMe.md'),
      )
    },
  )

  it.each(['win32', 'darwin', 'linux'] as const)(
    'rejects every other relative file on %s',
    (platform) => {
      const openedFile = platform === 'win32' ? 'C:\\Notes\\ReadMe.md' : '/notes/ReadMe.md'

      expect(() => resolveWorkspacePath(singleFileState(openedFile), 'other.md', platform)).toThrow(
        'Single-file mode only allows operations on the opened file',
      )
    },
  )
})
