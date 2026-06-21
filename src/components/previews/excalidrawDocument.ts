export type ExcalidrawDocumentData = {
  type: string
  version: number
  source: string
  elements: unknown[]
  appState: Record<string, unknown>
  files: Record<string, unknown>
}

export type LoadedExcalidrawDocument = {
  content: string
  initialData: ExcalidrawDocumentData
}

export const EMPTY_EXCALIDRAW_DOCUMENT: ExcalidrawDocumentData = {
  type: 'excalidraw',
  version: 2,
  source: 'marklab',
  elements: [],
  appState: {},
  files: {},
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const normalizeExcalidrawDocument = (value: Record<string, unknown>): ExcalidrawDocumentData => ({
  type: typeof value.type === 'string' ? value.type : EMPTY_EXCALIDRAW_DOCUMENT.type,
  version: typeof value.version === 'number' ? value.version : EMPTY_EXCALIDRAW_DOCUMENT.version,
  source: typeof value.source === 'string' ? value.source : EMPTY_EXCALIDRAW_DOCUMENT.source,
  elements: Array.isArray(value.elements) ? value.elements : [],
  appState: isRecord(value.appState) ? value.appState : {},
  files: isRecord(value.files) ? value.files : {},
})

export const parseExcalidrawDocument = (content: string): LoadedExcalidrawDocument => {
  const trimmed = content.trim()

  if (!trimmed) {
    return {
      content: JSON.stringify(EMPTY_EXCALIDRAW_DOCUMENT, null, 2),
      initialData: EMPTY_EXCALIDRAW_DOCUMENT,
    }
  }

  const parsed: unknown = JSON.parse(trimmed)

  if (!isRecord(parsed)) {
    throw new Error('Invalid Excalidraw document')
  }

  return {
    content: trimmed,
    initialData: normalizeExcalidrawDocument(parsed),
  }
}
