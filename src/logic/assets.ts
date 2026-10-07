export const MARKDOWN_ASSET_REPORT_LIMIT = 80

export type MarkdownAssetStatus = 'available' | 'missing' | 'unverified'

export type MarkdownAssetReference = {
  id: string
  sourcePath: string
  target: string
  targetPath: string | null
  mediaType: string | null
  context: string
  line: number
  column: number
  status: MarkdownAssetStatus
}

export type MarkdownAssetReport = {
  indexed: boolean
  currentPath: string | null
  currentAssets: MarkdownAssetReference[]
  currentAssetCount: number
  currentMissingCount: number
  workspaceMissingAssets: MarkdownAssetReference[]
  workspaceMissingCount: number
  limit: number
}
