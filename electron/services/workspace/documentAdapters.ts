import path from 'node:path'

export type WorkspaceDocumentAdapterKind =
  | 'audio'
  | 'docx'
  | 'drawio'
  | 'excalidraw'
  | 'image'
  | 'pdf'
  | 'video'

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
] as const satisfies readonly WorkspaceDocumentAdapter[]

const adapterByExtension = new Map<string, WorkspaceDocumentAdapter>(
  workspaceDocumentAdapters.flatMap((adapter) =>
    adapter.extensions.map((extension) => [extension, adapter] as const),
  ),
)

export const workspaceDocumentAdapterForPath = (value: string): WorkspaceDocumentAdapter | null =>
  adapterByExtension.get(path.extname(value).toLowerCase()) ?? null
