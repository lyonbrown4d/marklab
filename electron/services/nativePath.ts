import path from 'node:path'
import { normalize as normalizePortablePath } from 'pathe'

const windowsSeparator = String.fromCharCode(92)
const windowsNamespacePrefix = `${windowsSeparator}${windowsSeparator}?${windowsSeparator}`
const windowsUncNamespacePrefix = `${windowsNamespacePrefix}UNC${windowsSeparator}`

export const stripWindowsNamespacePath = (value: string): string => {
  if (value.startsWith(windowsUncNamespacePrefix)) {
    return `${windowsSeparator}${windowsSeparator}${value.slice(windowsUncNamespacePrefix.length)}`
  }
  if (value.startsWith(windowsNamespacePrefix)) {
    return value.slice(windowsNamespacePrefix.length)
  }
  return value
}

export const normalizeNativePath = (value: string): string => {
  return path.resolve(stripWindowsNamespacePath(value))
}

export const normalizeComparablePath = (value: string): string => {
  const normalized = normalizePortablePath(value)
  return normalized === '.' ? '' : normalized
}

export const isNativePathInsideOrEqual = (root: string, target: string): boolean => {
  const relative = normalizeComparablePath(
    path.relative(normalizeNativePath(root), normalizeNativePath(target)),
  )
  return (
    relative === '' ||
    (!relative.startsWith('../') && relative !== '..' && !path.isAbsolute(relative))
  )
}
