export const hashText = (value: string): string => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
  }
  return `${hash >>> 0}`
}

export const normalizePathPrefix = (value: string): string =>
  value.endsWith('/') ? value.slice(0, -1) : value

export const escapeLikePrefix = (value: string): string =>
  value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')
