import type {
  WorkspaceOccurrenceSearchCancelResult,
  WorkspaceOccurrenceSearchRequest,
} from '@electron/services/workspace/workspaceSearchTypes'

const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/
const MAX_QUERY_LENGTH = 256
const MAX_RESULT_LIMIT = 500

export const parseOccurrenceSearchRequest = (value: unknown): WorkspaceOccurrenceSearchRequest => {
  const record = exactRecord(value, ['requestId', 'query', 'options'], ['limit'])
  const requestId = requestIdValue(record.requestId)
  const query = stringValue(record.query, 'query')
  if (!query.trim()) throw new Error('query must be a non-empty string')
  if (query.length > MAX_QUERY_LENGTH) {
    throw new Error(`query must not exceed ${MAX_QUERY_LENGTH} characters`)
  }
  const options = exactRecord(record.options, ['caseSensitive', 'wholeWord', 'useRegex'])
  const limit = record.limit === undefined ? undefined : resultLimitValue(record.limit)
  return {
    requestId,
    query,
    ...(limit === undefined ? {} : { limit }),
    options: {
      caseSensitive: booleanValue(options.caseSensitive, 'options.caseSensitive'),
      wholeWord: booleanValue(options.wholeWord, 'options.wholeWord'),
      useRegex: booleanValue(options.useRegex, 'options.useRegex'),
    },
  }
}

export const parseOccurrenceSearchCancel = (
  value: unknown,
): Pick<WorkspaceOccurrenceSearchCancelResult, 'requestId'> => {
  const record = exactRecord(value, ['requestId'])
  return { requestId: requestIdValue(record.requestId) }
}

const exactRecord = (
  value: unknown,
  required: string[],
  optional: string[] = [],
): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('request must be an object')
  }
  const record = value as Record<string, unknown>
  const allowed = new Set([...required, ...optional])
  if (!required.every((key) => Object.hasOwn(record, key))) {
    throw new Error('request is missing required fields')
  }
  if (!Object.keys(record).every((key) => allowed.has(key))) {
    throw new Error('request contains unsupported fields')
  }
  return record
}

const requestIdValue = (value: unknown): string => {
  const requestId = stringValue(value, 'requestId')
  if (!requestIdPattern.test(requestId)) throw new Error('requestId is invalid')
  return requestId
}

const stringValue = (value: unknown, field: string): string => {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`)
  return value
}

const booleanValue = (value: unknown, field: string): boolean => {
  if (typeof value !== 'boolean') throw new Error(`${field} must be a boolean`)
  return value
}

const resultLimitValue = (value: unknown): number => {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 1 ||
    (value as number) > MAX_RESULT_LIMIT
  ) {
    throw new Error(`limit must be an integer between 1 and ${MAX_RESULT_LIMIT}`)
  }
  return value as number
}
