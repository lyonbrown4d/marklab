import { z } from 'zod'

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

const recordSchema = z.record(z.string(), z.unknown())

const excalidrawDocumentSchema = z.object({
  type: z.string().catch(EMPTY_EXCALIDRAW_DOCUMENT.type),
  version: z.number().catch(EMPTY_EXCALIDRAW_DOCUMENT.version),
  source: z.string().catch(EMPTY_EXCALIDRAW_DOCUMENT.source),
  elements: z.array(z.unknown()).catch([]),
  appState: recordSchema.catch({}),
  files: recordSchema.catch({}),
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
  const result = excalidrawDocumentSchema.safeParse(parsed)

  if (!result.success) {
    throw new Error('Invalid Excalidraw document')
  }

  return {
    content: trimmed,
    initialData: result.data,
  }
}
