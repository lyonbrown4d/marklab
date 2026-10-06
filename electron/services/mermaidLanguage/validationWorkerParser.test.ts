import { describe, expect, it } from 'vitest'

import { validateWithOfficialMermaidParser } from '@electron/services/mermaidLanguage/validationWorkerParser.js'

describe('validateWithOfficialMermaidParser', () => {
  it('accepts valid syntax with the official Mermaid parser', async () => {
    await expect(validateWithOfficialMermaidParser('flowchart LR\n  A --> B')).resolves.toEqual([])
  })

  it('rejects invalid diagram body syntax with parser location data', async () => {
    await expect(validateWithOfficialMermaidParser('flowchart LR\n  A -->')).rejects.toMatchObject({
      message: expect.stringContaining('Parse error'),
    })
  })
})
