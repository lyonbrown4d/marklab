import electronLog from 'electron-log/main'

export type LogFields = Record<string, unknown>

export type Logger = {
  child: (scope: string) => Logger
  debug: (message: string, fields?: LogFields) => void
  error: (message: string, fields?: LogFields) => void
  info: (message: string, fields?: LogFields) => void
  warn: (message: string, fields?: LogFields) => void
}

type ElectronLoggerOptions = {
  isPackaged: boolean
}

type LogLevel = 'debug' | 'error' | 'info' | 'warn'

export const createElectronLogger = ({ isPackaged }: ElectronLoggerOptions): Logger => {
  electronLog.transports.console.level = isPackaged ? 'info' : 'debug'
  electronLog.transports.file.level = isPackaged ? 'info' : 'debug'
  electronLog.transports.file.fileName = 'main.log'
  electronLog.transports.file.maxSize = 5 * 1024 * 1024
  electronLog.errorHandler.startCatching({ showDialog: false })

  return createScopedLogger([])
}

export const noopLogger: Logger = {
  child: () => noopLogger,
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
}

const createScopedLogger = (scopes: string[]): Logger => {
  return {
    child: (scope) => createScopedLogger([...scopes, scope]),
    debug: (message, fields) => writeLog('debug', scopes, message, fields),
    error: (message, fields) => writeLog('error', scopes, message, fields),
    info: (message, fields) => writeLog('info', scopes, message, fields),
    warn: (message, fields) => writeLog('warn', scopes, message, fields),
  }
}

const writeLog = (level: LogLevel, scopes: string[], message: string, fields?: LogFields): void => {
  const scopedMessage = scopes.length > 0 ? `[${scopes.join(':')}] ${message}` : message
  const sanitizedFields = fields ? safelySanitizeFields(fields) : null
  if (sanitizedFields) {
    electronLog[level](scopedMessage, sanitizedFields)
    return
  }
  electronLog[level](scopedMessage)
}

const safelySanitizeFields = (fields: LogFields): LogFields | null => {
  try {
    return sanitizeFields(fields)
  } catch {
    return { diagnostics: '[Unavailable]' }
  }
}

const sanitizeFields = (fields: LogFields): LogFields | null => {
  const result: LogFields = {}
  const context: SanitizeContext = {
    remainingChars: 56 * 1024,
    remainingNodes: 500,
    seen: new WeakSet<object>(),
  }
  let fieldIndex = 0
  for (const key in fields) {
    if (!Object.hasOwn(fields, key)) continue
    if (Object.keys(result).length >= 50 || context.remainingNodes <= 0) {
      result.__truncated__ = consumeMarker('[Truncated]', context)
      break
    }
    const outputKey = sanitizeFieldKey(key, fieldIndex, context)
    if (!outputKey) {
      result.__truncated__ = '[Truncated]'
      break
    }
    const value = safeRead(fields, key)
    if (value !== undefined) result[outputKey] = sanitizeValue(value, key, context, 0)
    fieldIndex += 1
  }
  return Object.keys(result).length > 0 ? result : null
}

type SanitizeContext = {
  remainingChars: number
  remainingNodes: number
  seen: WeakSet<object>
}

const sensitiveFieldMarkers = [
  'accesskey',
  'apikey',
  'authorization',
  'clientkey',
  'cookie',
  'credential',
  'passphrase',
  'password',
  'privatekey',
  'secret',
  'token',
]

const isSensitiveField = (key: string): boolean => {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
  return sensitiveFieldMarkers.some((marker) => normalized.includes(marker))
}

const sanitizeValue = (
  value: unknown,
  key: string,
  context: SanitizeContext,
  depth: number,
): unknown => {
  if (isSensitiveField(key)) return consumeMarker('[REDACTED]', context)
  if (context.remainingNodes <= 0 || context.remainingChars <= 0) {
    return consumeMarker('[Truncated]', context)
  }
  context.remainingNodes -= 1
  if (value instanceof Error) {
    return {
      message: sanitizeText(safeErrorText(value, 'message', 'Unknown error'), 500, context),
      name: sanitizeText(safeErrorText(value, 'name', 'Error'), 100, context),
      stack: sanitizeOptionalErrorStack(value, context),
    }
  }
  if (typeof value === 'string') return sanitizeText(value, 500, context)
  if (!value || typeof value !== 'object') return value
  if (context.seen.has(value)) return consumeMarker('[Circular]', context)
  if (depth >= 5) return consumeMarker('[MaxDepth]', context)
  context.seen.add(value)
  if (Array.isArray(value)) {
    const result: unknown[] = []
    for (let index = 0; index < Math.min(value.length, 50); index += 1) {
      if (context.remainingNodes <= 0 || context.remainingChars <= 0) {
        result.push(consumeMarker('[Truncated]', context))
        break
      }
      result.push(sanitizeValue(safeRead(value, String(index)), '', context, depth + 1))
    }
    if (value.length > 50) result.push(consumeMarker('[Truncated]', context))
    return result
  }
  const result: LogFields = {}
  let fieldIndex = 0
  for (const nestedKey in value) {
    if (!Object.hasOwn(value, nestedKey)) continue
    if (Object.keys(result).length >= 50 || context.remainingNodes <= 0) {
      result.__truncated__ = consumeMarker('[Truncated]', context)
      break
    }
    const outputKey = sanitizeFieldKey(nestedKey, fieldIndex, context)
    if (!outputKey) {
      result.__truncated__ = '[Truncated]'
      break
    }
    const item = safeRead(value, nestedKey)
    if (item !== undefined) {
      result[outputKey] = sanitizeValue(item, nestedKey, context, depth + 1)
    }
    fieldIndex += 1
  }
  return result
}

const sanitizeText = (value: string, maxLength: number, context: SanitizeContext): string => {
  const redacted = redactSensitiveText(value.slice(0, maxLength * 2))
  const available = Math.max(0, Math.min(maxLength, context.remainingChars))
  if (available === 0) return '[Truncated]'
  const result = redacted.length > available ? withEllipsis(redacted, available) : redacted
  context.remainingChars -= result.length
  return result
}

const redactSensitiveText = (value: string): string =>
  value
    .replace(
      /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----[\s\S]*?(?:-----END(?: [A-Z0-9]+)* PRIVATE KEY-----|$)/gi,
      '[REDACTED_PEM]',
    )
    .replace(
      /(\b(?:api[-_]?key|access[-_]?key|client[-_]?key|private[-_]?key|authorization|passphrase|password|secret|token)\s*[:=]\s*)(["'])[\s\S]*?\2/gi,
      '$1$2[REDACTED]$2',
    )
    .replace(/\b(Bearer|Basic)\s+[^\s,;]+/gi, '$1 [REDACTED]')
    .replace(/\bhttps?:\/\/[^\s"'<>]+/gi, redactUrl)
    .replace(
      /(\b(?:api[-_]?key|access[-_]?key|client[-_]?key|private[-_]?key|authorization|passphrase|password|secret|token)\s*[:=]\s*)[^\s,;]+/gi,
      '$1[REDACTED]',
    )

const sanitizeFieldKey = (key: string, index: number, context: SanitizeContext): string | null => {
  if (context.remainingChars <= 0) return null
  const suffix = key.length > 128 ? `...[${index}]` : ''
  const maxPrefixLength = Math.max(0, 128 - suffix.length)
  const output = `${key.slice(0, maxPrefixLength)}${suffix}`.slice(0, context.remainingChars)
  context.remainingChars -= output.length
  return output || null
}

const consumeMarker = (marker: string, context: SanitizeContext): string => {
  context.remainingChars = Math.max(0, context.remainingChars - marker.length)
  return marker
}

const withEllipsis = (value: string, maxLength: number): string => {
  if (maxLength <= 3) return '.'.repeat(maxLength)
  return `${value.slice(0, maxLength - 3)}...`
}

const redactUrl = (rawUrl: string): string => {
  try {
    const url = new URL(rawUrl)
    if (url.username || url.password) {
      url.username = '[REDACTED]'
      url.password = ''
    }
    if (url.search) url.search = '?[REDACTED]'
    if (url.hash) url.hash = '#[REDACTED]'
    return url.toString()
  } catch {
    return '[REDACTED_URL]'
  }
}

const safeErrorText = (error: Error, key: 'message' | 'name', fallback: string): string => {
  try {
    const value = error[key]
    return typeof value === 'string' && value ? value : fallback
  } catch {
    return fallback
  }
}

const sanitizeOptionalErrorStack = (error: Error, context: SanitizeContext): string | undefined => {
  try {
    return typeof error.stack === 'string' ? sanitizeText(error.stack, 4_000, context) : undefined
  } catch {
    return undefined
  }
}

const safeRead = (value: object, key: string): unknown => {
  try {
    return (value as Record<string, unknown>)[key]
  } catch {
    return '[Unavailable]'
  }
}
