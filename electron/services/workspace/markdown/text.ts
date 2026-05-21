export const charLength = (value: string): number => {
  return [...value].length
}

export const sliceChars = (value: string, start: number, end: number): string => {
  return [...value].slice(start, end).join('')
}

export const trimLineBreaks = (value: string): string => {
  return value.replace(/^\n+|\n+$/g, '')
}

export const normalizeContext = (value: string): string => {
  return value.split(/\s+/).filter(Boolean).join(' ')
}

export const decodeURIComponentSafe = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
