import { describe, expect, it } from 'vitest'
import { isFileRouteAvailable } from '@/pages/fileRouteHelpers'
import type { FileEntry } from '@/store/appTypes'

const files: FileEntry[] = [{ kind: 'file', path: 'README.md' }]

describe('isFileRouteAvailable', () => {
  it('accepts an active deep file before its lazy tree branch is loaded', () => {
    expect(isFileRouteAvailable(files, 'guides/deep/topic.md', 'guides/deep/topic.md')).toBe(true)
  })

  it('accepts a file already present in the loaded tree', () => {
    expect(isFileRouteAvailable(files, 'README.md', null)).toBe(true)
  })

  it('rejects a route that is neither active nor present in the loaded tree', () => {
    expect(isFileRouteAvailable(files, 'missing.md', 'README.md')).toBe(false)
  })
})
