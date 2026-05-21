export type FsRootKind = 'internal' | 'external' | 'single'
export type FsEntryKind = 'file' | 'folder'

export type FsRootInfo = {
  kind: FsRootKind
  path: string
}

export type FsEntry = {
  path: string
  name: string
  kind: FsEntryKind
}

export type FsSnapshot = {
  root: FsRootInfo
  entries: FsEntry[]
}

export type FsPathMetadata = {
  path: string
  absolute_path: string
  kind: FsEntryKind
  size_bytes: number
  modified_ms?: number
  readonly: boolean
}

export type FsBufferStatus = {
  path: string
  revision: number
  dirty: boolean
}

export type BackgroundTaskStatus = {
  id: string
  label: string
  status: 'idle' | 'running' | 'error'
  message?: string | null
}

export type FsMarkdownHeading = {
  path: string
  level: number
  text: string
  slug: string
  line: number
  column: number
}

export type FsMarkdownLink = {
  source_path: string
  text: string
  target: string
  link_type: 'markdown' | 'wiki'
  target_path?: string | null
  target_anchor?: string | null
  target_heading_slug?: string | null
  is_external: boolean
  context: string
  line: number
  column: number
}

export type FsMarkdownAsset = {
  source_path: string
  text?: string | null
  target: string
  target_path?: string | null
  is_external: boolean
  media_type?: string | null
  context: string
  line: number
  column: number
}

export type FsIndexedMarkdownFile = {
  path: string
  headings: FsMarkdownHeading[]
  links: FsMarkdownLink[]
  assets: FsMarkdownAsset[]
}

export type FsWorkspaceIndex = {
  files: FsIndexedMarkdownFile[]
  paths?: string[]
  asset_paths?: string[]
}

export type FsMarkdownDiagnostic = {
  line: number
  start_column: number
  end_column: number
  message: string
  severity: 'error' | 'warning'
}

export type FsSearchResult = {
  path: string
  title: string
  line: number
  column: number
  end_column: number
  snippet: string
  snippet_highlights: Array<{ start: number; end: number }>
  score: number
}

export type FsMarkdownBlock = {
  id: string
  kind: 'paragraph' | 'blockquote' | 'code' | 'list' | 'divider' | 'table'
  text?: string | null
  level?: number | null
  language?: string | null
  ordered?: boolean | null
  items?: string[] | null
}

export type FsGraphNode = {
  id: string
  kind: 'file' | 'heading' | 'missing' | 'external'
  label: string
  path?: string | null
  line?: number | null
  level?: number | null
  slug?: string | null
  content?: string | null
  content_blocks?: FsMarkdownBlock[] | null
  content_start_line?: number | null
  content_end_line?: number | null
}

export type FsGraphEdge = {
  id: string
  source: string
  target: string
  kind: 'contains' | 'links_to' | 'references_heading'
}

export type FsGraph = {
  mode: 'outline' | 'mindmap'
  nodes: FsGraphNode[]
  edges: FsGraphEdge[]
}

export type FsMarkdownAssetImportResult = {
  markdown_target: string
  relative_path: string
  absolute_path: string
  asset_dir?: string | null
  copied: boolean
}

export type FsMarkdownAssetResolveResult = {
  source_path: string
  target: string
  absolute_path?: string | null
  relative_path?: string | null
  is_external: boolean
  media_type?: string | null
  exists: boolean
}

export type FsStateData = {
  rootKind: FsRootKind
  rootPath: string
  internalRoot: string
  singleFile: string | null
}
