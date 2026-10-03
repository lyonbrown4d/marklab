import { describe, expect, it } from 'vitest'
import {
  buildPlateInlineCompletionRequest,
  plateInlineCompletionDebounceMs,
} from '@/components/plate/completion/plateInlineCompletionRequest'

describe('Plate inline completion request policy', () => {
  it('maps trigger modes to increasing debounce delays', () => {
    expect(plateInlineCompletionDebounceMs('fast')).toBeLessThan(
      plateInlineCompletionDebounceMs('balanced'),
    )
    expect(plateInlineCompletionDebounceMs('balanced')).toBeLessThan(
      plateInlineCompletionDebounceMs('battery-saver'),
    )
  })

  it('bounds nearby context and excluded suggestions', () => {
    const request = buildPlateInlineCompletionRequest({
      completionSessionId: 'plate-1',
      context: {
        after: 'suffix',
        before: 'prefix',
        followingBlocks: ['after block'],
        heading: 'Plans',
        nodeType: 'p',
        precedingBlocks: ['before block'],
      },
      excluded: [' first', ' second', ' third'],
      includeNearbyContext: true,
      length: 'long',
      providerId: 'marklab-local',
      revision: 2,
    })

    expect(request).toMatchObject({
      completionSessionId: 'plate-1',
      excludedSuggestions: [' first', ' second'],
      heading: 'Plans',
      length: 'long',
      prefix: 'before block\nprefix',
      providerId: 'marklab-local',
      revision: 2,
      suffix: 'suffix\nafter block',
    })
  })
})
