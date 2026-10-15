import { describe, expect, it } from 'vitest'
import { createGitPollingCadence } from '@/features/git/gitPollingCadence'

const query = () => ({
  state: { data: { head: 'a' }, dataUpdateCount: 1, errorUpdateCount: 0, isInvalidated: false },
})

describe('Git polling cadence', () => {
  it('backs off equal successful reads to fifteen then thirty seconds without counting renders', () => {
    const cadence = createGitPollingCadence()
    const current = query()
    expect(cadence.interval(current)).toBe(5_000)
    for (let index = 1; index <= 6; index += 1) {
      current.state.dataUpdateCount += 1
      const expected = index >= 6 ? 30_000 : index >= 3 ? 15_000 : 5_000
      expect(cadence.interval(current)).toBe(expected)
      expect(cadence.interval(current)).toBe(expected)
    }
    current.state.dataUpdateCount += 1
    expect(cadence.interval(current)).toBe(30_000)
  })

  it('returns to fast reads after changes, errors, invalidation and explicit lifecycle reset', () => {
    const cadence = createGitPollingCadence()
    const current = query()
    const slow = () => {
      cadence.interval(current)
      for (let index = 0; index < 6; index += 1) {
        current.state.dataUpdateCount += 1
        cadence.interval(current)
      }
      expect(cadence.interval(current)).toBe(30_000)
    }
    slow()
    current.state.data = { head: 'b' }
    current.state.dataUpdateCount += 1
    expect(cadence.interval(current)).toBe(5_000)
    slow()
    current.state.errorUpdateCount += 1
    expect(cadence.interval(current)).toBe(5_000)
    slow()
    current.state.isInvalidated = true
    expect(cadence.interval(current)).toBe(5_000)
    current.state.isInvalidated = false
    slow()
    cadence.reset()
    expect(cadence.interval(current)).toBe(5_000)
  })

  it('keeps separate query observations so inactive history cannot slow changed status', () => {
    const cadence = createGitPollingCadence()
    const history = query()
    const status = query()
    cadence.interval(history)
    for (let index = 0; index < 6; index += 1) {
      history.state.dataUpdateCount += 1
      cadence.interval(history)
    }
    expect(cadence.interval(history)).toBe(30_000)
    expect(cadence.interval(status)).toBe(5_000)
  })
})
