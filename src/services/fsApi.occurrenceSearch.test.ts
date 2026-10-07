import { beforeEach, describe, expect, it, vi } from 'vitest'

import { invoke } from '@/runtime/ipc'
import { fsApi } from '@/services/fsApi'

vi.mock('@/runtime/ipc', () => ({ invoke: vi.fn() }))

const request = {
  requestId: 'request-1',
  query: 'needle',
  limit: 100,
  options: { caseSensitive: false, wholeWord: true, useRegex: false },
}

describe('fsApi occurrence search', () => {
  beforeEach(() => vi.mocked(invoke).mockReset())

  it('uses a typed occurrence command without changing legacy search', async () => {
    vi.mocked(invoke).mockResolvedValue({
      requestId: 'request-1',
      results: [],
      scannedDocuments: 3,
      totalHits: 0,
      truncated: false,
    })

    await expect(fsApi.searchWorkspaceOccurrences(request)).resolves.toMatchObject({
      requestId: 'request-1',
      scannedDocuments: 3,
    })
    expect(invoke).toHaveBeenCalledWith('fs_search_workspace_occurrences', request)
  })

  it('sends an explicit cancellation command and validates the acknowledgement', async () => {
    vi.mocked(invoke).mockResolvedValue({ cancelled: true, requestId: 'request-1' })

    await expect(fsApi.cancelWorkspaceOccurrenceSearch('request-1')).resolves.toEqual({
      cancelled: true,
      requestId: 'request-1',
    })
    expect(invoke).toHaveBeenCalledWith('fs_cancel_workspace_occurrence_search', {
      requestId: 'request-1',
    })
  })
})
