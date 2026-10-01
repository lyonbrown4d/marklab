import { describe, expect, it } from 'vitest'
import {
  drawioStateKeys,
  preferenceStateKeys,
  rendererPersistKeys,
} from '@electron/services/settingsPersistKeys'

describe('settingsPersistKeys', () => {
  it('allows drawio settings through the renderer persist boundary', () => {
    expect(rendererPersistKeys.has('marklab.drawio')).toBe(true)
    expect(drawioStateKeys.has('drawioEditorMode')).toBe(true)
    expect(drawioStateKeys.has('drawioEmbedUrl')).toBe(true)
  })

  it('allows local AI directory preferences through the renderer persist boundary', () => {
    expect(preferenceStateKeys).toEqual(
      expect.objectContaining({
        has: expect.any(Function),
      }),
    )
    expect(preferenceStateKeys.has('aiCustomModelDirectoryEnabled')).toBe(true)
    expect(preferenceStateKeys.has('aiModelDirectory')).toBe(true)
  })
})
