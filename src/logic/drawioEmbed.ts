import { z } from 'zod'

export const DEFAULT_DRAWIO_EMBED_URL = 'https://embed.diagrams.net/?embed=1&proto=json'

export type DrawioEditorMode = 'remote' | 'system'

export type DrawioEmbedUrlResult =
  | {
      ok: true
      origin: string
      url: string
    }
  | {
      error: string
      ok: false
    }

export type DrawioFrameMessage = {
  event: string
  message?: string
  xml?: string
}

export type DrawioLoadMessage = {
  action: 'load'
  autosave: 0 | 1
  modified: string
  saveAndExit: '0'
  title: string
  xml: string
}

export type DrawioStatusMessage = {
  action: 'status'
  message: string
  modified: boolean
}

export type DrawioSaveRequestMessage = {
  action: 'export'
  format: 'xml'
}

export const resolveDrawioEmbedUrl = (value: string): DrawioEmbedUrlResult => {
  try {
    const raw = value.trim() || DEFAULT_DRAWIO_EMBED_URL
    const url = new URL(raw)
    if (url.protocol !== 'https:') {
      return { error: 'Drawio embed URL must use HTTPS.', ok: false }
    }
    if (url.username || url.password) {
      return { error: 'Drawio embed URL must not include credentials.', ok: false }
    }

    url.searchParams.set('embed', '1')
    url.searchParams.set('proto', 'json')
    url.hash = ''

    return {
      ok: true,
      origin: url.origin,
      url: url.toString(),
    }
  } catch {
    return { error: 'Drawio embed URL is invalid.', ok: false }
  }
}

export const normalizeDrawioEmbedUrl = (value: string): string => {
  const result = resolveDrawioEmbedUrl(value)
  if (!result.ok) throw new Error(result.error)
  return result.url
}

export const serializeDrawioMessage = (
  message: DrawioLoadMessage | DrawioSaveRequestMessage | DrawioStatusMessage,
): string => JSON.stringify(message)

const drawioFrameMessageSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value

    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  },
  z.object({
    event: z.string().refine((value) => value.trim() !== ''),
    message: z.preprocess(
      (value) => (typeof value === 'string' ? value : undefined),
      z.string().optional(),
    ),
    xml: z.preprocess(
      (value) => (typeof value === 'string' ? value : undefined),
      z.string().optional(),
    ),
  }),
)

export const parseDrawioFrameMessage = (data: unknown): DrawioFrameMessage | null => {
  const result = drawioFrameMessageSchema.safeParse(data)
  if (!result.success) return null
  return result.data
}

export const createDrawioLoadMessage = ({
  title,
  xml,
}: {
  title: string
  xml: string
}): DrawioLoadMessage => ({
  action: 'load',
  autosave: 0,
  modified: 'unsavedChanges',
  saveAndExit: '0',
  title,
  xml,
})

export const createDrawioStatusMessage = (
  message: string,
  modified: boolean,
): DrawioStatusMessage => ({
  action: 'status',
  message,
  modified,
})

export const createDrawioSaveRequestMessage = (): DrawioSaveRequestMessage => ({
  action: 'export',
  format: 'xml',
})
