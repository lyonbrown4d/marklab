export const gitCredentialUrl = (value: string): string | null => {
  try {
    const url = new URL(value.trim())
    if (
      url.protocol !== 'https:' ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null
    return value.trim()
  } catch {
    return null
  }
}

export const defaultGitCredentialUrl = (remote: string): string => {
  const https = gitCredentialUrl(remote)
  if (https) return https
  try {
    const url = new URL(remote)
    if (url.protocol === 'ssh:' && !url.password && url.hostname) {
      return gitCredentialUrl(`https://${url.hostname}`) ?? ''
    }
  } catch {
    // scp-style Git remotes do not have a URL scheme.
  }
  if (remote.includes('://') || /^[a-z]:[\\/]/i.test(remote)) return ''
  const scp = /^(?:[^@/:]+@)?(\[[^\]]+\]|[^@/:]+):.+$/.exec(remote)
  return scp ? (gitCredentialUrl(`https://${scp[1]}`) ?? '') : ''
}
