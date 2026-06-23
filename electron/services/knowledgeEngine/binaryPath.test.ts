import { describe, expect, it } from 'vitest'

import {
  getKnowledgeEngineBinaryName,
  getKnowledgeEnginePlatformDir,
} from '@electron/services/knowledgeEngine/binaryPath.js'

describe('knowledge engine binary path helpers', () => {
  it('uses the current platform and architecture for resource folders', () => {
    expect(getKnowledgeEnginePlatformDir()).toBe(`${process.platform}-${process.arch}`)
  })

  it('uses a Windows executable suffix only on Windows', () => {
    expect(getKnowledgeEngineBinaryName().endsWith('.exe')).toBe(process.platform === 'win32')
  })
})
