import { describe, expect, it } from 'vitest'
import { isMainRendererUrl } from '@/quality/electronWindowUrl'

describe('isMainRendererUrl', () => {
  const rendererUrl = 'http://127.0.0.1:5173'

  it('accepts only the main renderer document at the renderer origin', () => {
    expect(isMainRendererUrl(`${rendererUrl}/`, rendererUrl)).toBe(true)
    expect(isMainRendererUrl(`${rendererUrl}/#/workspace/history`, rendererUrl)).toBe(true)
    expect(isMainRendererUrl(`${rendererUrl}/splashscreen.html`, rendererUrl)).toBe(false)
    expect(isMainRendererUrl(`${rendererUrl}/window-opening.html`, rendererUrl)).toBe(false)
  })
})
