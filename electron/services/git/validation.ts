const REMOTE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const URI_SCHEME_PATTERN = /^([A-Za-z][A-Za-z0-9+.-]*):\/\//
const SUPPORTED_URI_SCHEMES = new Set(['https', 'ssh', 'file'])
const SCP_REMOTE_PATTERN =
  /^(?:[A-Za-z0-9._-]+@)?(?:\[[A-Fa-f0-9:]+\]|[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?):[A-Za-z0-9._~/-]+$/
const WINDOWS_PATH_PATTERN = /^(?:[A-Za-z]:[\\/]|\\\\)/

const containsControlCharacter = (value: string): boolean => {
  return [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
}

const requiredString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Git ${label} cannot be empty`)
  if (containsControlCharacter(value)) {
    throw new Error(`Git ${label} contains invalid characters`)
  }
  return value.trim()
}

export const validateRemoteName = (value: unknown): string => {
  const name = requiredString(value, 'remote name')
  if (!REMOTE_NAME_PATTERN.test(name) || name.includes('..') || name.endsWith('.lock')) {
    throw new Error(`Invalid Git remote name: ${name}`)
  }
  return name
}

export const validateRemoteUrl = (value: unknown): string => {
  const url = requiredString(value, 'remote URL')
  if (url.startsWith('-')) throw new Error('Invalid Git remote URL')
  if (url.includes('::')) throw new Error('Git remote URL helpers are not allowed')
  const scheme = url.match(URI_SCHEME_PATTERN)?.[1]?.toLowerCase()
  if (scheme) {
    if (!SUPPORTED_URI_SCHEMES.has(scheme)) {
      throw new Error(`Unsupported Git remote URL scheme: ${scheme}`)
    }
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw new Error('Invalid Git remote URL')
    }
    if (scheme !== 'file' && !parsed.hostname) throw new Error('Invalid Git remote URL host')
    if (parsed.password || (scheme === 'https' && parsed.username)) {
      throw new Error('Git remote URL cannot contain embedded credentials')
    }
    if (parsed.search) throw new Error('Git remote URL query parameters are not allowed')
    if (parsed.hash) throw new Error('Git remote URL fragments are not allowed')
    return url
  }
  if (SCP_REMOTE_PATTERN.test(url) || WINDOWS_PATH_PATTERN.test(url)) return url
  if (url.includes(':')) throw new Error('Invalid Git remote URL or remote helper')
  return url
}

export const validateBranchName = (value: unknown): string => {
  const branch = requiredString(value, 'branch name')
  const invalid =
    branch === 'HEAD' ||
    branch.startsWith('-') ||
    branch.startsWith('.') ||
    branch.endsWith('.') ||
    branch.endsWith('/') ||
    branch.endsWith('.lock') ||
    branch.includes('..') ||
    branch.includes('//') ||
    branch.includes('@{') ||
    /[ ~^:?*[\\]/.test(branch)
  if (invalid) throw new Error(`Invalid Git branch name: ${branch}`)
  return branch
}
