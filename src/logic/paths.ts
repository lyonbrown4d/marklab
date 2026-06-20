export const normalizePath = (value: string) => {
  const parts = value.split('/').filter(Boolean)
  const stack: string[] = []
  for (const part of parts) {
    if (part === '.') continue
    if (part === '..') {
      stack.pop()
      continue
    }
    stack.push(part)
  }
  return stack.join('/')
}

export const resolveRelativePath = (base: string, target: string) => {
  const [pathPart] = target.split('#')
  if (pathPart.startsWith('/')) {
    return normalizePath(pathPart.slice(1))
  }
  const baseDir = base.split('/').slice(0, -1).join('/')
  const joined = baseDir ? `${baseDir}/${pathPart}` : pathPart
  return normalizePath(joined)
}

export const splitLinkTarget = (target: string) => {
  const hashIndex = target.indexOf('#')
  if (hashIndex === -1) {
    return { path: target, anchor: null }
  }
  return {
    path: target.slice(0, hashIndex),
    anchor: target.slice(hashIndex + 1),
  }
}

export const normalizeHeadingAnchor = (anchor: string) => {
  const value = anchor.trim()
  if (!value) return ''
  try {
    return slugify(decodeURIComponent(value))
  } catch {
    return slugify(value)
  }
}

export const createFileLabel = (relativePath: string) => {
  const base = relativePath.split('/').pop() ?? relativePath
  return base.replace(/\.(md|markdown|ics)$/i, '')
}

export const slugify = (label: string) => {
  return label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export const isExternalLink = (target: string) => {
  return /^(https?:\/\/|mailto:|tel:)/i.test(target)
}

export const extractLinks = (content: string) => {
  const links: Array<{
    text: string
    target: string
    type: 'markdown' | 'wiki'
    context: string
    line: number
    column: number
  }> = []
  const mdRegex = /\[([^\]]+)\]\(([^)]+)\)/g
  const wikiRegex = /\[\[([^\]]+)\]\]/g

  const getLineContext = (index: number) => {
    const lineStart = content.lastIndexOf('\n', index) + 1
    const lineBreak = content.indexOf('\n', index)
    const lineEnd = lineBreak === -1 ? content.length : lineBreak
    return content.slice(lineStart, lineEnd).replace(/\s+/g, ' ').trim()
  }

  const getSourceLocation = (index: number) => {
    const lineStart = content.lastIndexOf('\n', index) + 1
    return {
      line: content.slice(0, index).split('\n').length,
      column: index - lineStart + 1,
    }
  }

  let match = mdRegex.exec(content)
  while (match) {
    const location = getSourceLocation(match.index)
    links.push({
      text: match[1].trim(),
      target: match[2].trim(),
      type: 'markdown',
      context: getLineContext(match.index),
      line: location.line,
      column: location.column,
    })
    match = mdRegex.exec(content)
  }

  match = wikiRegex.exec(content)
  while (match) {
    const location = getSourceLocation(match.index)
    links.push({
      text: match[1].trim(),
      target: match[1].trim(),
      type: 'wiki',
      context: getLineContext(match.index),
      line: location.line,
      column: location.column,
    })
    match = wikiRegex.exec(content)
  }

  return links
}

export const extractHeadings = (content: string) => {
  const headings: Array<{ level: number; text: string; slug: string }> = []
  const usedSlugs = new Map<string, number>()
  const headingRegex = /^(#{1,6})\s+(.+)$/gm
  let match = headingRegex.exec(content)
  while (match) {
    const text = match[2].trim()
    const baseSlug = slugify(text) || `heading-${headings.length + 1}`
    const usedCount = usedSlugs.get(baseSlug) ?? 0
    usedSlugs.set(baseSlug, usedCount + 1)
    headings.push({
      level: match[1].length,
      text,
      slug: usedCount === 0 ? baseSlug : `${baseSlug}-${usedCount}`,
    })
    match = headingRegex.exec(content)
  }
  return headings
}
