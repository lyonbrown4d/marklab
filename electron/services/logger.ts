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
  const sanitizedFields = fields ? sanitizeFields(fields) : null
  if (sanitizedFields) {
    electronLog[level](scopedMessage, sanitizedFields)
    return
  }
  electronLog[level](scopedMessage)
}

const sanitizeFields = (fields: LogFields): LogFields | null => {
  const result: LogFields = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue
    result[key] = sanitizeValue(value)
  }
  return Object.keys(result).length > 0 ? result : null
}

const sanitizeValue = (value: unknown): unknown => {
  if (value instanceof Error) {
    return {
      message: value.message,
      name: value.name,
      stack: value.stack,
    }
  }
  if (typeof value === 'string' && value.length > 500) {
    return `${value.slice(0, 500)}...`
  }
  return value
}
