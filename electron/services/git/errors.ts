import type { GitErrorCode } from '@electron/services/git/types'

const URL_IN_TEXT_PATTERN = /[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s'")]+/g

export const redactGitUrl = (value: string): string => {
  if (!/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value)) return value
  try {
    const parsed = new URL(value)
    if (parsed.username || parsed.password) {
      parsed.username = '***'
      parsed.password = ''
    }
    if (parsed.search) parsed.search = '?***'
    if (parsed.hash) parsed.hash = '#***'
    return parsed.toString()
  } catch {
    return value.replace(/([A-Za-z][A-Za-z0-9+.-]*:\/\/)([^\s/]*@)/g, '$1***@')
  }
}

export const redactGitCredentials = (value: string): string => {
  return value.replace(URL_IN_TEXT_PATTERN, (url) => redactGitUrl(url))
}

export class GitOperationError extends Error {
  constructor(
    readonly code: GitErrorCode,
    message: string,
    cause?: unknown,
  ) {
    const sanitizedCause =
      cause instanceof Error ? new Error(redactGitCredentials(cause.message)) : undefined
    super(redactGitCredentials(message), sanitizedCause ? { cause: sanitizedCause } : undefined)
    this.name = 'GitOperationError'
  }
}
