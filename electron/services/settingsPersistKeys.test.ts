import { describe, expect, it } from 'vitest'
import { drawioStateKeys, rendererPersistKeys } from '@electron/services/settingsPersistKeys'

describe('settingsPersistKeys', () => {
  it('allows drawio settings through the renderer persist boundary', () => {
    expect(rendererPersistKeys.has('marklab.drawio')).toBe(true)
    expect(drawioStateKeys.has('drawioEditorMode')).toBe(true)
    expect(drawioStateKeys.has('drawioEmbedUrl')).toBe(true)
  })
})
