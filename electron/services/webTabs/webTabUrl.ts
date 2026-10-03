const MAX_WEB_TAB_URL_LENGTH = 4096
const URL_ERROR = 'Only credential-free HTTPS URLs are allowed'

export const normalizeWebTabUrl = (value: string): string => {
  if (value.length > MAX_WEB_TAB_URL_LENGTH) throw new Error('Web tab URL is too long')
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(URL_ERROR)
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error(URL_ERROR)
  }
  return parsed.href
}
