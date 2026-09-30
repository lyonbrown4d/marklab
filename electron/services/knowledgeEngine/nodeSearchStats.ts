export type NodeSearchIndexStats = {
  building: boolean
  documentCount: number
  indexBytes: number
  lastBuildDurationMs: number | null
  lastBuildError: string | null
  lastError: string | null
  updatedAt: string | null
}

export const emptyNodeSearchIndexStats = (): NodeSearchIndexStats => ({
  building: false,
  documentCount: 0,
  indexBytes: 0,
  lastBuildDurationMs: null,
  lastBuildError: null,
  lastError: null,
  updatedAt: null,
})
