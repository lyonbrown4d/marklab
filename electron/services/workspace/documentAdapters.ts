import path from 'node:path'

export type WorkspaceDocumentAdapterKind =
  'audio' | 'docx' | 'drawio' | 'excalidraw' | 'image' | 'pdf' | 'source' | 'video'

export type WorkspaceDocumentAdapter = {
  extensions: readonly string[]
  kind: WorkspaceDocumentAdapterKind
}

export const workspaceDocumentAdapters = [
  {
    extensions: [
      '.apng',
      '.avif',
      '.bmp',
      '.gif',
      '.ico',
      '.jpeg',
      '.jpg',
      '.png',
      '.svg',
      '.webp',
    ],
    kind: 'image',
  },
  {
    extensions: ['.aac', '.flac', '.m4a', '.mp3', '.oga', '.ogg', '.opus', '.wav'],
    kind: 'audio',
  },
  {
    extensions: ['.m4v', '.mov', '.mp4', '.ogv', '.webm'],
    kind: 'video',
  },
  {
    extensions: ['.pdf'],
    kind: 'pdf',
  },
  {
    extensions: ['.docx'],
    kind: 'docx',
  },
  {
    extensions: ['.dio', '.drawio'],
    kind: 'drawio',
  },
  {
    extensions: ['.excalidraw'],
    kind: 'excalidraw',
  },
  {
    extensions: [
      '.bash',
      '.c',
      '.cc',
      '.conf',
      '.cpp',
      '.cs',
      '.css',
      '.csv',
      '.cts',
      '.cxx',
      '.gql',
      '.go',
      '.gradle',
      '.graphql',
      '.h',
      '.hh',
      '.hpp',
      '.htm',
      '.html',
      '.hxx',
      '.ini',
      '.java',
      '.js',
      '.json',
      '.jsonc',
      '.jsx',
      '.kt',
      '.kts',
      '.less',
      '.lua',
      '.mjs',
      '.mts',
      '.php',
      '.properties',
      '.proto',
      '.ps1',
      '.py',
      '.rb',
      '.rs',
      '.scss',
      '.sh',
      '.sql',
      '.svelte',
      '.swift',
      '.toml',
      '.ts',
      '.tsv',
      '.tsx',
      '.txt',
      '.vue',
      '.xml',
      '.yaml',
      '.yml',
      '.zsh',
    ],
    kind: 'source',
  },
] as const satisfies readonly WorkspaceDocumentAdapter[]

const adapterByExtension = new Map<string, WorkspaceDocumentAdapter>(
  workspaceDocumentAdapters.flatMap((adapter) =>
    adapter.extensions.map((extension) => [extension, adapter] as const),
  ),
)

const sourceAdapter = workspaceDocumentAdapters.find((adapter) => adapter.kind === 'source') ?? null
const sourceDotFileNames = new Set(['.editorconfig', '.gitignore', '.npmrc'])
const sourceFileNames = new Set([...sourceDotFileNames, 'dockerfile', 'justfile', 'makefile'])

export const isWorkspaceSourceDotFileName = (value: string): boolean =>
  sourceDotFileNames.has(path.basename(value).toLowerCase())

export const workspaceDocumentAdapterForPath = (value: string): WorkspaceDocumentAdapter | null => {
  const adapter = adapterByExtension.get(path.extname(value).toLowerCase())
  if (adapter) return adapter
  return sourceFileNames.has(path.basename(value).toLowerCase()) ? sourceAdapter : null
}
