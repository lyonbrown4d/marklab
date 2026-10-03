export type DocumentAdapterKind =
  'audio' | 'docx' | 'drawio' | 'excalidraw' | 'image' | 'pdf' | 'source' | 'video'
export type DocumentAdapterMarkdownEmbedKind = 'document' | 'image' | 'media' | 'pdf'

export type DocumentAdapterIcon = 'audio' | 'document' | 'image' | 'pdf' | 'video'

export type DocumentAdapterCapabilities = {
  edit: boolean
  externalOpenFallback: boolean
  markdownEmbed: boolean
  preview: boolean
  textExtraction: boolean
  thumbnail: boolean
}

export type DocumentAdapter = {
  capabilities: DocumentAdapterCapabilities
  extensions: readonly string[]
  icon: DocumentAdapterIcon
  kind: DocumentAdapterKind
}

export const documentAdapters = [
  {
    capabilities: {
      edit: false,
      externalOpenFallback: true,
      markdownEmbed: true,
      preview: true,
      textExtraction: false,
      thumbnail: true,
    },
    extensions: ['apng', 'avif', 'bmp', 'gif', 'ico', 'jpeg', 'jpg', 'png', 'svg', 'webp'],
    icon: 'image',
    kind: 'image',
  },
  {
    capabilities: {
      edit: false,
      externalOpenFallback: true,
      markdownEmbed: true,
      preview: true,
      textExtraction: false,
      thumbnail: false,
    },
    extensions: ['aac', 'flac', 'm4a', 'mp3', 'oga', 'ogg', 'opus', 'wav'],
    icon: 'audio',
    kind: 'audio',
  },
  {
    capabilities: {
      edit: false,
      externalOpenFallback: true,
      markdownEmbed: true,
      preview: true,
      textExtraction: false,
      thumbnail: true,
    },
    extensions: ['m4v', 'mov', 'mp4', 'ogv', 'webm'],
    icon: 'video',
    kind: 'video',
  },
  {
    capabilities: {
      edit: false,
      externalOpenFallback: true,
      markdownEmbed: true,
      preview: true,
      textExtraction: true,
      thumbnail: true,
    },
    extensions: ['pdf'],
    icon: 'pdf',
    kind: 'pdf',
  },
  {
    capabilities: {
      edit: false,
      externalOpenFallback: true,
      markdownEmbed: true,
      preview: true,
      textExtraction: true,
      thumbnail: false,
    },
    extensions: ['docx'],
    icon: 'document',
    kind: 'docx',
  },
  {
    capabilities: {
      edit: true,
      externalOpenFallback: true,
      markdownEmbed: true,
      preview: true,
      textExtraction: false,
      thumbnail: false,
    },
    extensions: ['dio', 'drawio'],
    icon: 'document',
    kind: 'drawio',
  },
  {
    capabilities: {
      edit: true,
      externalOpenFallback: true,
      markdownEmbed: true,
      preview: true,
      textExtraction: false,
      thumbnail: false,
    },
    extensions: ['excalidraw'],
    icon: 'document',
    kind: 'excalidraw',
  },
  {
    capabilities: {
      edit: false,
      externalOpenFallback: true,
      markdownEmbed: true,
      preview: true,
      textExtraction: true,
      thumbnail: false,
    },
    extensions: [
      'bash',
      'c',
      'cc',
      'conf',
      'cpp',
      'cs',
      'css',
      'csv',
      'cts',
      'cxx',
      'go',
      'h',
      'hh',
      'hpp',
      'htm',
      'html',
      'hxx',
      'ini',
      'java',
      'js',
      'json',
      'jsonc',
      'jsx',
      'kt',
      'kts',
      'less',
      'lua',
      'mjs',
      'mts',
      'php',
      'ps1',
      'py',
      'rb',
      'rs',
      'scss',
      'sh',
      'sql',
      'svelte',
      'swift',
      'toml',
      'ts',
      'tsv',
      'tsx',
      'txt',
      'vue',
      'xml',
      'yaml',
      'yml',
      'zsh',
    ],
    icon: 'document',
    kind: 'source',
  },
] as const satisfies readonly DocumentAdapter[]

export const DOCUMENT_ADAPTER_EXTENSIONS = documentAdapters.flatMap((adapter) => [
  ...adapter.extensions,
])

const adapterByExtension = new Map<string, DocumentAdapter>(
  documentAdapters.flatMap((adapter) =>
    adapter.extensions.map((extension) => [extension, adapter] as const),
  ),
)

export const documentAdapterForExtension = (extension: string): DocumentAdapter | null =>
  adapterByExtension.get(extension.toLowerCase()) ?? null

export const documentAdapterForPath = (value: string): DocumentAdapter | null =>
  documentAdapterForExtension(fileExtension(value))

export const documentAdapterExtensionsForKind = (kind: DocumentAdapterKind) =>
  documentAdapters.find((adapter) => adapter.kind === kind)?.extensions ?? []

export const documentAdapterMarkdownEmbedKind = (
  adapter: DocumentAdapter | null,
): DocumentAdapterMarkdownEmbedKind | null => {
  if (!adapter?.capabilities.markdownEmbed) {
    return null
  }

  if (adapter.kind === 'image' || adapter.kind === 'pdf') {
    return adapter.kind
  }

  if (adapter.kind === 'audio' || adapter.kind === 'video') {
    return 'media'
  }

  if (
    adapter.kind === 'docx' ||
    adapter.kind === 'drawio' ||
    adapter.kind === 'excalidraw' ||
    adapter.kind === 'source'
  ) {
    return 'document'
  }

  return null
}

export const documentAdapterForMarkdownEmbedPath = (value: string): DocumentAdapter | null => {
  const adapter = documentAdapterForPath(value)
  return documentAdapterMarkdownEmbedKind(adapter) ? adapter : null
}

export const documentAdapterMarkdownEmbedKindForPath = (value: string) =>
  documentAdapterMarkdownEmbedKind(documentAdapterForPath(value))

export const fileExtension = (value: string): string => {
  const name = cleanPath(value).split(/[\\/]/).filter(Boolean).pop() ?? ''
  const index = name.lastIndexOf('.')
  if (index <= 0 || index === name.length - 1) return ''
  return name.slice(index + 1).toLowerCase()
}

const cleanPath = (value: string) => value.trim().split('#')[0]?.split('?')[0] ?? value.trim()
