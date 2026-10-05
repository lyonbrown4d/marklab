import { describe, expect, it } from 'vitest'
import { syncQueryKeys } from '@/features/workspace-sync/syncQueries'

describe('syncQueryKeys', () => {
  it('isolates channel cache entries by workspace root', () => {
    expect(syncQueryKeys.channels('C:/one')).not.toEqual(syncQueryKeys.channels('D:/two'))
  })
})
