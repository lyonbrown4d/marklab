import { describe, expect, it } from 'vitest'

import { allowedCommands } from '@electron/preload/allowlists'
import { fsApi } from '@/services/fsApi'

describe('legacy outline graph boundary', () => {
  it('does not expose the removed single-file graph command to the renderer', () => {
    expect(allowedCommands.has('fs_get_outline_graph')).toBe(false)
    expect(fsApi).not.toHaveProperty('getOutlineGraph')
  })
})
