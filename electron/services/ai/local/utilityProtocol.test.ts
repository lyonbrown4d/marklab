import { describe, expect, it } from 'vitest'

import {
  isLocalAiUtilityRequest,
  isLocalAiUtilityResponse,
} from '@electron/services/ai/local/utilityProtocol.js'

describe('local AI utility protocol', () => {
  it('accepts only bounded protocol message shapes', () => {
    expect(
      isLocalAiUtilityRequest({
        type: 'generate',
        request: { requestId: 'r1', modelPath: 'model.gguf', prompt: 'hello' },
      }),
    ).toBe(true)
    expect(isLocalAiUtilityRequest({ type: 'invoke', command: 'rm -rf' })).toBe(false)
    expect(
      isLocalAiUtilityResponse({ type: 'event', event: { requestId: 'r1', type: 'cancelled' } }),
    ).toBe(true)
    expect(isLocalAiUtilityResponse({ type: 'event', event: { type: 'delta' } })).toBe(false)
  })
})
