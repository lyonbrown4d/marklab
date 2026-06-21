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

export const parseDrawioFrameMessage = (data: unknown): DrawioFrameMessage | null => {
  const value = typeof data === 'string' ? safeParseJson(data) : data
  if (!value || typeof value !== 'object' || !('event' in value)) return null
  const event = (value as Record<string, unknown>).event
  if (typeof event !== 'string' || event.trim() === '') return null

  const xml = (value as Record<string, unknown>).xml
  const message = (value as Record<string, unknown>).message
  return {
    event,
    message: typeof message === 'string' ? message : undefined,
    xml: typeof xml === 'string' ? xml : undefined,
  }
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

const safeParseJson = (value: string): unknown => {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}
