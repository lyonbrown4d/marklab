type PollQuery = {
  state: {
    data: unknown
    dataUpdateCount: number
    errorUpdateCount: number
    isInvalidated: boolean
  }
}

type Observation = {
  data: unknown
  updates: number
  errors: number
  unchanged: number
}

const ACTIVE_INTERVAL_MS = 5_000

// Query's structural sharing preserves data identity for equal local Git snapshots.
// Keep only weak query references; polling must not extend cache or document lifetime.
export const createGitPollingCadence = () => {
  let observations = new WeakMap<PollQuery, Observation>()
  return {
    reset: () => {
      observations = new WeakMap()
    },
    interval: (query: PollQuery): number => {
      const { data, dataUpdateCount, errorUpdateCount, isInvalidated } = query.state
      const previous = observations.get(query)
      let unchanged = previous?.unchanged ?? 0
      if (
        !previous ||
        isInvalidated ||
        data !== previous.data ||
        errorUpdateCount !== previous.errors
      ) {
        unchanged = 0
      } else if (dataUpdateCount !== previous.updates) {
        unchanged += 1
      }
      observations.set(query, {
        data,
        updates: dataUpdateCount,
        errors: errorUpdateCount,
        unchanged,
      })
      if (unchanged >= 6) return 30_000
      if (unchanged >= 3) return 15_000
      return ACTIVE_INTERVAL_MS
    },
  }
}
