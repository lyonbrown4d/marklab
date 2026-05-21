import path from 'node:path'

import {
  isExternalTarget,
  isMarkdownPath,
  normalizeRelativePath,
  stripAssetQueryAndHash,
} from './path.js'
import type {
  FsGraph,
  FsGraphEdge,
  FsGraphNode,
  FsIndexedMarkdownFile,
  FsMarkdownAsset,
  FsMarkdownBlock,
  FsMarkdownDiagnostic,
  FsMarkdownHeading,
  FsMarkdownLink,
  FsSearchResult,
  FsWorkspaceIndex,
} from './types.js'

type ParsedLinkTarget = {
  targetPath: string | null
  anchor: string | null
  headingSlug: string | null
  external: boolean
}

type LinkTargetKind = 'markdown' | 'asset'

type HeadingEntry = {
  heading: FsMarkdownHeading
  contentStartLine: number
}

type FenceState = {
  marker: '`' | '~'
  length: number
}

type ReferenceDefinition = {
  target: string
}

type InlineTarget = {
  text: string
  target: string
  type: 'markdown' | 'wiki'
  image: boolean
  line: number
  column: number
  context: string
}

type SearchTerm = {
  raw: string
  folded: string
}

type SearchCandidate = {
  line: number
  column: number
  endColumn: number
  snippet: string
  highlights: Array<{ start: number; end: number }>
  score: number
}

type GraphTarget = {
  id: string
  edgeKind: FsGraphEdge['kind']
  headingPath?: string
}

const assetMediaTypes: Record<string, string> = {
  '.aac': 'audio/aac',
  '.apng': 'image/apng',
  '.avif': 'image/avif',
  '.avi': 'video/x-msvideo',
  '.bmp': 'image/bmp',
  '.flac': 'audio/flac',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.m4a': 'audio/mp4',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.oga': 'audio/ogg',
  '.ogg': 'audio/ogg',
  '.ogv': 'video/ogg',
  '.opus': 'audio/ogg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.wmv': 'video/x-ms-wmv',
}

const assetExtensions = new Set(Object.keys(assetMediaTypes))

export function parseMarkdownDocument(sourcePath: string, content: string): FsIndexedMarkdownFile {
  const headings = parseHeadings(sourcePath, content)
  const referenceDefinitions = collectReferenceDefinitions(content)
  const links: FsMarkdownLink[] = []
  const assets: FsMarkdownAsset[] = []
  const lines = content.split(/\r?\n/)
  let fence: FenceState | null = null

  lines.forEach((line, index) => {
    const lineNumber = index + 1
    const nextFence = parseFence(line)
    if (nextFence) {
      if (fence && nextFence.marker === fence.marker && nextFence.length >= fence.length) {
        fence = null
      } else if (!fence) {
        fence = nextFence
      }
      return
    }
    if (fence || isReferenceDefinitionLine(line)) return

    for (const target of scanInlineTargets(line, lineNumber, referenceDefinitions)) {
      if (target.image || looksLikeAssetTarget(target.target)) {
        assets.push(
          createAsset(
            sourcePath,
            target.text,
            target.target,
            target.context,
            target.line,
            target.column,
          ),
        )
      } else {
        links.push(
          createLink(
            sourcePath,
            target.text,
            target.target,
            target.type,
            target.context,
            target.line,
            target.column,
          ),
        )
      }
    }
  })

  return { path: sourcePath, headings, links, assets }
}

export function diagnosticsForFile(
  index: FsWorkspaceIndex,
  filePath: string,
): FsMarkdownDiagnostic[] {
  const filesByPath = new Map(index.files.map((file) => [file.path, file]))
  const knownPaths = workspaceKnownPaths(index)
  const diagnostics: FsMarkdownDiagnostic[] = []
  const file = filesByPath.get(filePath)
  if (!file) return diagnostics

  for (const link of file.links) {
    if (link.is_external) continue
    const targetPath = resolveIndexedLinkPath(link, filesByPath, index.files)
    if (!targetPath) continue
    const targetFile = filesByPath.get(targetPath)
    if (!targetFile) {
      diagnostics.push(
        markdownDiagnostic(link, `Cannot find linked file "${link.target}"`, 'error'),
      )
      continue
    }

    const slug = link.target_heading_slug
    if (!slug || targetFile.headings.some((heading) => heading.slug === slug)) continue
    diagnostics.push(
      markdownDiagnostic(
        link,
        `Cannot find heading "${link.target_anchor ?? slug}" in ${targetPath}`,
        'warning',
      ),
    )
  }

  if (knownPaths) {
    for (const asset of file.assets) {
      if (asset.is_external || !asset.target_path) continue
      if (knownPaths.has(asset.target_path)) continue
      diagnostics.push({
        line: asset.line,
        start_column: asset.column,
        end_column: asset.column + charLength(asset.target),
        message: `Cannot find local asset "${asset.target}"`,
        severity: 'error',
      })
    }
  }

  return diagnostics
}

export function searchDocuments(
  documents: Array<{ path: string; content: string }>,
  query: string,
  limit: number,
): FsSearchResult[] {
  const terms = parseSearchTerms(query)
  if (terms.length === 0 || limit <= 0) return []

  const normalizedQuery = foldSearchText(query.trim())
  const cappedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100)
  const results: FsSearchResult[] = []

  for (const document of documents) {
    const title = fileLabel(document.path)
    const foldedPath = foldSearchText(document.path)
    const foldedTitle = foldSearchText(title)
    const foldedBody = foldSearchText(document.content)
    const searchable = `${foldedPath}\n${foldedTitle}\n${foldedBody}`
    if (!terms.every((term) => searchable.includes(term.folded))) continue

    const bestBody = bestBodyCandidate(document.content, terms)
    const titleScore = scoreText(foldedTitle, terms) * 36
    const pathScore = scoreText(foldedPath, terms) * 18
    const exactBonus = normalizedQuery
      ? exactQueryBonus([foldedTitle, foldedPath, foldedBody], normalizedQuery)
      : 0
    const candidate = bestBody ?? fallbackSearchCandidate(document.content, title, terms)

    results.push({
      path: document.path,
      title,
      line: candidate.line,
      column: candidate.column,
      end_column: candidate.endColumn,
      snippet: candidate.snippet,
      snippet_highlights: candidate.highlights,
      score: titleScore + pathScore + candidate.score + exactBonus,
    })
  }

  return results
    .sort(
      (a, b) =>
        b.score - a.score || a.path.localeCompare(b.path) || a.line - b.line || a.column - b.column,
    )
    .slice(0, cappedLimit)
}

export function buildWorkspaceGraph(index: FsWorkspaceIndex): FsGraph {
  const nodes: FsGraphNode[] = []
  const edges: FsGraphEdge[] = []
  const filesByPath = new Map(index.files.map((file) => [file.path, file]))
  const headings = new Map<string, FsGraphNode>()
  const headingContainsEdges = new Set<string>()

  for (const file of index.files) {
    nodes.push(fileNode(file.path))
    for (const heading of file.headings) {
      const id = headingNodeId(file.path, heading.slug)
      headings.set(id, {
        id,
        kind: 'heading',
        label: heading.text,
        path: file.path,
        line: heading.line,
        level: heading.level,
        slug: heading.slug,
      })
    }
  }

  const added = new Set(nodes.map((node) => node.id))
  for (const file of index.files) {
    const source = fileNodeId(file.path)
    for (const link of file.links) {
      const target = workspaceGraphTarget(link, filesByPath, headings, index.files, nodes, added)
      if (target.headingPath) {
        addHeadingContainsEdge(target.headingPath, target.id, edges, headingContainsEdges)
      }
      edges.push({
        id: `${source}->${target.id}-${edges.length}`,
        source,
        target: target.id,
        kind: target.edgeKind,
      })
    }
  }

  return { mode: 'mindmap', nodes, edges }
}

export function buildOutlineGraph(filePath: string, content: string): FsGraph {
  const nodes: FsGraphNode[] = [fileNode(filePath)]
  const edges: FsGraphEdge[] = []
  const entries = parseHeadingEntries(filePath, content)
  const stack: Array<{ level: number; id: string }> = []
  const lines = content.split(/\r?\n/)

  entries.forEach((entry, index) => {
    const heading = entry.heading
    const id = headingNodeId(filePath, heading.slug)
    const nextLine = entries[index + 1]?.heading.line ?? lines.length + 1
    const contentStartLine = Math.min(entry.contentStartLine, nextLine)
    const contentLines = lines.slice(
      contentStartLine - 1,
      Math.max(contentStartLine - 1, nextLine - 1),
    )
    const headingContent = trimLineBreaks(contentLines.join('\n'))
    while (stack.length > 0 && stack[stack.length - 1]!.level >= heading.level) stack.pop()
    const parent = stack.length > 0 ? stack[stack.length - 1]!.id : fileNodeId(filePath)
    nodes.push({
      id,
      kind: 'heading',
      label: heading.text,
      path: filePath,
      line: heading.line,
      level: heading.level,
      slug: heading.slug,
      content: headingContent,
      content_blocks: parseMarkdownBlocks(id, headingContent),
      content_start_line: contentStartLine,
      content_end_line: nextLine,
    })
    edges.push({
      id: `${parent}->${id}-${edges.length}`,
      source: parent,
      target: id,
      kind: 'contains',
    })
    stack.push({ level: heading.level, id })
  })

  return { mode: 'outline', nodes, edges }
}

export function guessMediaType(target: string): string | null {
  const dataType = dataUriMediaType(target)
  if (dataType) return dataType
  const ext = path.posix
    .extname(decodeURIComponentSafe(stripAssetQueryAndHash(target)))
    .toLowerCase()
  return assetMediaTypes[ext] ?? null
}

export function fileLabel(filePath: string): string {
  const base = path.posix.basename(normalizeRelativePath(filePath))
  return base.replace(/\.(md|markdown)$/i, '')
}

function parseHeadings(sourcePath: string, content: string): FsMarkdownHeading[] {
  return parseHeadingEntries(sourcePath, content).map((entry) => entry.heading)
}

function parseHeadingEntries(sourcePath: string, content: string): HeadingEntry[] {
  const usedSlugs = new Map<string, number>()
  const headings: HeadingEntry[] = []
  const lines = content.split(/\r?\n/)
  let fence: FenceState | null = null
  let previousParagraphLine: { index: number; text: string } | null = null
  const consumedSetextLines = new Set<number>()

  lines.forEach((line, index) => {
    const nextFence = parseFence(line)
    if (nextFence) {
      if (fence && nextFence.marker === fence.marker && nextFence.length >= fence.length) {
        fence = null
      } else if (!fence) {
        fence = nextFence
      }
      previousParagraphLine = null
      return
    }
    if (fence) return

    const setextLevel = parseSetextUnderline(line)
    if (setextLevel && previousParagraphLine) {
      const text = markdownPlainText(previousParagraphLine.text).trim()
      if (text) {
        headings.push(
          headingEntry(
            sourcePath,
            setextLevel,
            text,
            previousParagraphLine.index + 1,
            firstContentColumn(previousParagraphLine.text),
            index + 2,
            usedSlugs,
          ),
        )
        consumedSetextLines.add(previousParagraphLine.index)
      }
      previousParagraphLine = null
      return
    }

    const atxHeading = parseAtxHeadingLine(line)
    if (atxHeading) {
      headings.push(
        headingEntry(
          sourcePath,
          atxHeading.level,
          atxHeading.text,
          index + 1,
          atxHeading.column,
          index + 2,
          usedSlugs,
        ),
      )
      previousParagraphLine = null
      return
    }

    if (isPotentialSetextText(line) && !consumedSetextLines.has(index)) {
      previousParagraphLine = { index, text: line }
    } else if (!line.trim()) {
      previousParagraphLine = null
    } else {
      previousParagraphLine = null
    }
  })

  return headings
}

function headingEntry(
  sourcePath: string,
  level: number,
  text: string,
  line: number,
  column: number,
  contentStartLine: number,
  usedSlugs: Map<string, number>,
): HeadingEntry {
  return {
    heading: {
      path: sourcePath,
      level,
      text,
      slug: uniqueSlug(text, usedSlugs),
      line,
      column,
    },
    contentStartLine,
  }
}

function parseAtxHeadingLine(line: string): { level: number; text: string; column: number } | null {
  const match = /^( {0,3})(#{1,6})(?:[ \t]+|$)(.*)$/.exec(line)
  if (!match) return null
  const rawText = (match[3] ?? '').replace(/[ \t]+#{1,}[ \t]*$/, '')
  const text = markdownPlainText(rawText).trim()
  if (!text) return null
  return { level: match[2]!.length, text, column: charLength(match[1] ?? '') + 1 }
}

function parseSetextUnderline(line: string): number | null {
  if (/^[ \t]{0,3}=+[ \t]*$/.test(line)) return 1
  if (/^[ \t]{0,3}-+[ \t]*$/.test(line)) return 2
  return null
}

function isPotentialSetextText(line: string): boolean {
  if (!line.trim()) return false
  if (/^[ \t]{0,3}(#{1,6}|\||>|[-*+] |\d+[.)] )/.test(line)) return false
  return !parseFence(line)
}

function firstContentColumn(line: string): number {
  const match = /\S/.exec(line)
  return match ? charLength(line.slice(0, match.index)) + 1 : 1
}

function createLink(
  sourcePath: string,
  text: string,
  target: string,
  type: 'markdown' | 'wiki',
  context: string,
  line: number,
  column: number,
): FsMarkdownLink {
  const parsed = parseLinkTarget(sourcePath, target, type, 'markdown')
  return {
    source_path: sourcePath,
    text: text || target,
    target,
    link_type: type,
    target_path: parsed.targetPath,
    target_anchor: parsed.anchor,
    target_heading_slug: parsed.headingSlug,
    is_external: parsed.external,
    context: normalizeContext(context),
    line,
    column,
  }
}

function createAsset(
  sourcePath: string,
  text: string,
  target: string,
  context: string,
  line: number,
  column: number,
): FsMarkdownAsset {
  const parsed = parseLinkTarget(sourcePath, target, 'markdown', 'asset')
  const normalizedContext = normalizeContext([text, context].filter(Boolean).join(' '))
  return {
    source_path: sourcePath,
    text: text || null,
    target,
    target_path: parsed.targetPath,
    is_external: parsed.external,
    media_type: guessMediaType(target),
    context: normalizedContext,
    line,
    column,
  }
}

function parseLinkTarget(
  sourcePath: string,
  target: string,
  type: 'markdown' | 'wiki',
  kind: LinkTargetKind,
): ParsedLinkTarget {
  const trimmed = unwrapLinkDestination(target.trim())
  if (isExternalTarget(trimmed)) {
    return { targetPath: null, anchor: null, headingSlug: null, external: true }
  }

  const { pathPart, anchorPart } = splitLinkTarget(trimmed)
  const anchor = anchorPart ? decodeURIComponentSafe(anchorPart.trim()) : null
  const headingSlug = anchor ? slugify(anchor) : null
  const localPath = decodeURIComponentSafe(stripQuery(pathPart.trim()))
  let targetPath: string | null

  if (kind === 'asset') {
    targetPath = localPath ? resolveRelativeWorkspacePath(sourcePath, localPath) : null
  } else if (localPath) {
    const resolved =
      type === 'wiki'
        ? normalizeWorkspacePath(ensureMarkdownTarget(localPath))
        : ensureMarkdownTarget(resolveRelativeWorkspacePath(sourcePath, localPath))
    targetPath = resolved
  } else {
    targetPath = sourcePath
  }

  return { targetPath, anchor, headingSlug, external: false }
}

function collectReferenceDefinitions(content: string): Map<string, ReferenceDefinition> {
  const definitions = new Map<string, ReferenceDefinition>()
  const lines = content.split(/\r?\n/)
  let fence: FenceState | null = null

  for (const line of lines) {
    const nextFence = parseFence(line)
    if (nextFence) {
      if (fence && nextFence.marker === fence.marker && nextFence.length >= fence.length) {
        fence = null
      } else if (!fence) {
        fence = nextFence
      }
      continue
    }
    if (fence) continue

    const definition = parseReferenceDefinition(line)
    if (definition) {
      definitions.set(normalizeReferenceLabel(definition.label), { target: definition.target })
    }
  }

  return definitions
}

function parseReferenceDefinition(line: string): { label: string; target: string } | null {
  const match = /^[ \t]{0,3}\[([^\]]+)]:[ \t]*(.+)$/.exec(line)
  if (!match) return null
  const target = parseMarkdownDestination(match[2] ?? '')
  if (!target) return null
  return { label: match[1] ?? '', target }
}

function isReferenceDefinitionLine(line: string): boolean {
  return parseReferenceDefinition(line) != null
}

function scanInlineTargets(
  line: string,
  lineNumber: number,
  references: Map<string, ReferenceDefinition>,
): InlineTarget[] {
  const targets: InlineTarget[] = []
  let index = 0

  while (index < line.length) {
    const char = line[index]
    if (char === '\\') {
      index += 2
      continue
    }

    if (char === '`') {
      index = skipCodeSpan(line, index)
      continue
    }

    const wiki = parseWikiTarget(line, index, lineNumber)
    if (wiki) {
      targets.push(wiki.target)
      index = wiki.end
      continue
    }

    const markdown = parseMarkdownInlineTarget(line, index, lineNumber, references)
    if (markdown) {
      targets.push(markdown.target)
      index = markdown.end
      continue
    }

    const autoLink = parseAutoLink(line, index, lineNumber)
    if (autoLink) {
      targets.push(autoLink.target)
      index = autoLink.end
      continue
    }

    index += 1
  }

  return targets
}

function parseWikiTarget(
  line: string,
  index: number,
  lineNumber: number,
): { target: InlineTarget; end: number } | null {
  const image = line.startsWith('![[', index)
  const starts = image || line.startsWith('[[', index)
  if (!starts) return null
  const openLength = image ? 3 : 2
  const end = line.indexOf(']]', index + openLength)
  if (end < 0) return null

  const raw = line.slice(index + openLength, end).trim()
  const separator = raw.indexOf('|')
  const destination = (separator >= 0 ? raw.slice(0, separator) : raw).trim()
  const alias = separator >= 0 ? raw.slice(separator + 1).trim() : ''
  if (!destination) return null

  return {
    target: {
      text: markdownPlainText(alias || destination),
      target: destination,
      type: 'wiki',
      image,
      line: lineNumber,
      column: charLength(line.slice(0, index)) + 1,
      context: line,
    },
    end: end + 2,
  }
}

function parseMarkdownInlineTarget(
  line: string,
  index: number,
  lineNumber: number,
  references: Map<string, ReferenceDefinition>,
): { target: InlineTarget; end: number } | null {
  const image = line[index] === '!' && line[index + 1] === '['
  if (!image && line[index] !== '[') return null

  const openBracket = image ? index + 1 : index
  const closeBracket = findClosingBracket(line, openBracket)
  if (closeBracket < 0) return null

  const label = line.slice(openBracket + 1, closeBracket)
  const after = skipInlineWhitespace(line, closeBracket + 1)
  let target: string | null
  let end = closeBracket + 1

  if (line[after] === '(') {
    const closeParen = findClosingParen(line, after)
    if (closeParen < 0) return null
    target = parseMarkdownDestination(line.slice(after + 1, closeParen))
    end = closeParen + 1
  } else if (line[after] === '[') {
    const closeReference = line.indexOf(']', after + 1)
    if (closeReference < 0) return null
    const referenceLabel = line.slice(after + 1, closeReference) || label
    target = references.get(normalizeReferenceLabel(referenceLabel))?.target ?? null
    end = closeReference + 1
  } else {
    target = references.get(normalizeReferenceLabel(label))?.target ?? null
  }

  if (!target) return null

  return {
    target: {
      text: markdownPlainText(label).trim() || target,
      target,
      type: 'markdown',
      image,
      line: lineNumber,
      column: charLength(line.slice(0, index)) + 1,
      context: line,
    },
    end,
  }
}

function parseAutoLink(
  line: string,
  index: number,
  lineNumber: number,
): { target: InlineTarget; end: number } | null {
  if (line[index] !== '<') return null
  const end = line.indexOf('>', index + 1)
  if (end < 0) return null
  const target = line.slice(index + 1, end).trim()
  if (!isExternalTarget(target)) return null
  return {
    target: {
      text: target,
      target,
      type: 'markdown',
      image: false,
      line: lineNumber,
      column: charLength(line.slice(0, index)) + 1,
      context: line,
    },
    end: end + 1,
  }
}

function parseMarkdownDestination(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('<')) {
    const end = findClosingAngle(trimmed, 0)
    return end > 0 ? trimmed.slice(1, end).trim() || null : null
  }

  let depth = 0
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index]
    if (char === '\\') {
      index += 1
      continue
    }
    if (char === '(') depth += 1
    if (char === ')' && depth > 0) depth -= 1
    if (depth === 0 && /\s/.test(char ?? '')) {
      return trimmed.slice(0, index).trim() || null
    }
  }
  return trimmed
}

function findClosingBracket(line: string, openIndex: number): number {
  let depth = 1
  for (let index = openIndex + 1; index < line.length; index += 1) {
    const char = line[index]
    if (char === '\\') {
      index += 1
      continue
    }
    if (char === '[') depth += 1
    if (char === ']') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

function findClosingParen(line: string, openIndex: number): number {
  let depth = 0
  let quote: string | null = null
  for (let index = openIndex + 1; index < line.length; index += 1) {
    const char = line[index]
    if (char === '\\') {
      index += 1
      continue
    }
    if (quote) {
      if (char === quote) quote = null
      continue
    }
    if ((char === '"' || char === "'") && /\s/.test(line[index - 1] ?? '')) {
      quote = char
      continue
    }
    if (char === '<') {
      const close = findClosingAngle(line, index)
      if (close > index) index = close
      continue
    }
    if (char === '(') {
      depth += 1
      continue
    }
    if (char === ')') {
      if (depth === 0) return index
      depth -= 1
    }
  }
  return -1
}

function findClosingAngle(line: string, openIndex: number): number {
  for (let index = openIndex + 1; index < line.length; index += 1) {
    if (line[index] === '\\') {
      index += 1
      continue
    }
    if (line[index] === '>') return index
  }
  return -1
}

function skipCodeSpan(line: string, index: number): number {
  let length = 0
  while (line[index + length] === '`') length += 1
  const marker = '`'.repeat(length)
  const close = line.indexOf(marker, index + length)
  return close >= 0 ? close + length : line.length
}

function skipInlineWhitespace(line: string, index: number): number {
  let next = index
  while (next < line.length && /[ \t]/.test(line[next] ?? '')) next += 1
  return next
}

function workspaceGraphTarget(
  link: FsMarkdownLink,
  filesByPath: Map<string, FsIndexedMarkdownFile>,
  headings: Map<string, FsGraphNode>,
  files: FsIndexedMarkdownFile[],
  nodes: FsGraphNode[],
  added: Set<string>,
): GraphTarget {
  if (link.is_external) {
    const id = `ext:${link.target}`
    if (!added.has(id)) {
      added.add(id)
      nodes.push({
        id,
        kind: 'external',
        label: link.text.trim() || externalLabel(link.target),
        line: link.line,
      })
    }
    return { id, edgeKind: 'links_to' }
  }

  const targetPath =
    resolveIndexedLinkPath(link, filesByPath, files) ?? link.target_path ?? link.target
  if (link.target_heading_slug) {
    const id = headingNodeId(targetPath, link.target_heading_slug)
    const heading = headings.get(id)
    if (heading) {
      if (!added.has(id)) {
        added.add(id)
        nodes.push(heading)
      }
      return { id, edgeKind: 'references_heading', headingPath: targetPath }
    }
  }

  if (filesByPath.has(targetPath)) return { id: fileNodeId(targetPath), edgeKind: 'links_to' }

  const missingId = `missing:${targetPath}`
  if (!added.has(missingId)) {
    added.add(missingId)
    nodes.push({
      id: missingId,
      kind: 'missing',
      label: fileLabel(targetPath),
      path: targetPath,
      line: link.line,
    })
  }
  return { id: missingId, edgeKind: 'links_to' }
}

function addHeadingContainsEdge(
  filePath: string,
  headingId: string,
  edges: FsGraphEdge[],
  added: Set<string>,
): void {
  const source = fileNodeId(filePath)
  const key = `${source}->${headingId}`
  if (added.has(key)) return
  added.add(key)
  edges.push({
    id: `${source}->${headingId}-${edges.length}`,
    source,
    target: headingId,
    kind: 'contains',
  })
}

function resolveIndexedLinkPath(
  link: FsMarkdownLink,
  filesByPath: Map<string, FsIndexedMarkdownFile>,
  files: FsIndexedMarkdownFile[],
): string | null {
  if (!link.target_path) return null
  if (filesByPath.has(link.target_path)) return link.target_path

  const markdownCandidate = resolveMarkdownPathCandidate(link.target_path, filesByPath)
  if (markdownCandidate) return markdownCandidate

  if (link.link_type === 'wiki') {
    const { pathPart } = splitLinkTarget(link.target)
    const wikiTarget = decodeURIComponentSafe(stripQuery(pathPart.trim()))
    const byLabel = findFileByLabel(wikiTarget, files)
    if (byLabel) return byLabel.path
  }

  return link.target_path
}

function resolveMarkdownPathCandidate(
  targetPath: string,
  filesByPath: Map<string, FsIndexedMarkdownFile>,
): string | null {
  if (filesByPath.has(targetPath)) return targetPath
  const ext = path.posix.extname(targetPath).toLowerCase()
  const withoutExt = ext ? targetPath.slice(0, -ext.length) : targetPath
  const candidates =
    ext === '.md'
      ? [`${withoutExt}.markdown`]
      : ext === '.markdown'
        ? [`${withoutExt}.md`]
        : [`${targetPath}.md`, `${targetPath}.markdown`]
  return candidates.find((candidate) => filesByPath.has(candidate)) ?? null
}

function findFileByLabel(
  target: string,
  files: FsIndexedMarkdownFile[],
): FsIndexedMarkdownFile | null {
  const normalized = fileLabel(target).toLowerCase()
  return files.find((file) => fileLabel(file.path).toLowerCase() === normalized) ?? null
}

function parseMarkdownBlocks(baseId: string, markdown: string): FsMarkdownBlock[] {
  const blocks: FsMarkdownBlock[] = []
  const lines = markdown.split(/\r?\n/)
  let paragraph: string[] = []
  let index = 0

  const pushBlock = (block: Omit<FsMarkdownBlock, 'id'>) => {
    blocks.push({ id: `${baseId}:block:${blocks.length}`, ...block })
  }

  const flushParagraph = () => {
    const text = trimLineBreaks(paragraph.join('\n')).trim()
    paragraph = []
    if (text) pushBlock({ kind: 'paragraph', text })
  }

  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (!line.trim()) {
      flushParagraph()
      index += 1
      continue
    }

    const fence = parseFence(line)
    if (fence) {
      flushParagraph()
      const language = codeFenceLanguage(line)
      const code: string[] = []
      index += 1
      while (index < lines.length) {
        const candidate = parseFence(lines[index] ?? '')
        if (candidate && candidate.marker === fence.marker && candidate.length >= fence.length)
          break
        code.push(lines[index] ?? '')
        index += 1
      }
      if (index < lines.length) index += 1
      const text = trimLineBreaks(code.join('\n'))
      if (text) pushBlock({ kind: 'code', text, language })
      continue
    }

    if (isDividerLine(line)) {
      flushParagraph()
      pushBlock({ kind: 'divider' })
      index += 1
      continue
    }

    if (isTableStart(lines, index)) {
      flushParagraph()
      const tableLines = [lines[index] ?? '', lines[index + 1] ?? '']
      index += 2
      while (index < lines.length && isTableRow(lines[index] ?? '')) {
        tableLines.push(lines[index] ?? '')
        index += 1
      }
      pushBlock({ kind: 'table', text: serializeTable(tableLines) })
      continue
    }

    if (isBlockquoteLine(line)) {
      flushParagraph()
      const quoteLines: string[] = []
      let level = 1
      while (
        index < lines.length &&
        (isBlockquoteLine(lines[index] ?? '') || !(lines[index] ?? '').trim())
      ) {
        const quote = parseBlockquoteLine(lines[index] ?? '')
        if (quote) {
          level = Math.max(level, quote.level)
          quoteLines.push(quote.text)
        } else {
          quoteLines.push('')
        }
        index += 1
      }
      const text = trimLineBreaks(quoteLines.join('\n')).trim()
      if (text) pushBlock({ kind: 'blockquote', text, level })
      continue
    }

    const listMarker = parseListMarker(line)
    if (listMarker) {
      flushParagraph()
      const items: string[] = []
      const ordered = listMarker.ordered
      while (index < lines.length) {
        const current = lines[index] ?? ''
        const marker = parseListMarker(current)
        if (!marker || marker.ordered !== ordered) break
        const itemLines = [current.slice(marker.end).trim()]
        index += 1
        while (
          index < lines.length &&
          (isIndentedContinuation(lines[index] ?? '') ||
            (!(lines[index] ?? '').trim() && index + 1 < lines.length))
        ) {
          const continuation = lines[index] ?? ''
          if (!continuation.trim()) {
            itemLines.push('')
            index += 1
            continue
          }
          if (
            parseListMarker(continuation) ||
            isDividerLine(continuation) ||
            parseFence(continuation)
          )
            break
          itemLines.push(continuation.replace(/^[ \t]{2,4}/, ''))
          index += 1
        }
        const item = trimLineBreaks(itemLines.join('\n')).trim()
        if (item) items.push(item)
      }
      if (items.length > 0) pushBlock({ kind: 'list', ordered, items })
      continue
    }

    paragraph.push(line)
    index += 1
  }

  flushParagraph()
  return blocks
}

function bestBodyCandidate(content: string, terms: SearchTerm[]): SearchCandidate | null {
  const lines = content.split(/\r?\n/)
  let best: SearchCandidate | null = null

  lines.forEach((line, index) => {
    const folded = foldSearchText(line)
    const occurrences = findTermOccurrences(folded, terms)
    if (occurrences.length === 0) return
    const firstOccurrence = occurrences[0]!
    const heading = parseAtxHeadingLine(line)
    const uniqueTerms = new Set(occurrences.map((occurrence) => occurrence.term.folded)).size
    const allTermsBonus = terms.every((term) => folded.includes(term.folded)) ? 18 : 0
    const headingBonus = heading ? 38 - heading.level * 3 : 0
    const density =
      occurrences.reduce((sum, occurrence) => sum + occurrence.term.raw.length, 0) /
      Math.max(charLength(line), 1)
    const score =
      occurrences.length * 11 + uniqueTerms * 8 + allTermsBonus + headingBonus + density * 20
    const candidate = createSearchCandidate(
      line,
      index + 1,
      firstOccurrence.start,
      firstOccurrence.end,
      terms,
      score,
    )
    if (
      !best ||
      candidate.score > best.score ||
      (candidate.score === best.score && candidate.line < best.line)
    ) {
      best = candidate
    }
  })

  return best
}

function fallbackSearchCandidate(
  content: string,
  title: string,
  terms: SearchTerm[],
): SearchCandidate {
  const firstLine = content
    .split(/\r?\n/)
    .find((line) => line.trim())
    ?.trim()
  const snippet = firstLine || title
  const folded = foldSearchText(snippet)
  const occurrence = findTermOccurrences(folded, terms)[0]
  const start = occurrence?.start ?? 0
  const end = occurrence?.end ?? Math.max(1, charLength(snippet))
  return createSearchCandidate(snippet, 1, start, end, terms, 1)
}

function createSearchCandidate(
  line: string,
  lineNumber: number,
  matchStart: number,
  matchEnd: number,
  terms: SearchTerm[],
  score: number,
): SearchCandidate {
  const snippetWindow = 180
  const lineLength = charLength(line)
  const start = Math.max(0, matchStart - 70)
  const end = Math.min(lineLength, Math.max(matchEnd + 70, start + snippetWindow))
  const snippetStart = Math.max(0, Math.min(start, Math.max(0, lineLength - snippetWindow)))
  const snippetEnd = Math.min(lineLength, Math.max(end, snippetStart + 1))
  const snippetWithPadding = sliceChars(line, snippetStart, snippetEnd)
  const snippet = snippetWithPadding.trim()
  const highlights = snippetHighlights(snippetWithPadding, terms)
  return {
    line: lineNumber,
    column: matchStart + 1,
    endColumn: Math.max(matchEnd + 1, matchStart + 2),
    snippet,
    highlights,
    score,
  }
}

function parseSearchTerms(query: string): SearchTerm[] {
  const rawTerms: string[] = []
  const pattern = /"([^"]+)"|'([^']+)'|`([^`]+)`|(\S+)/g
  for (const match of query.matchAll(pattern)) {
    const raw = (match[1] ?? match[2] ?? match[3] ?? match[4] ?? '').trim()
    const normalized = raw.replace(/^["'`:+~*?()[\]-]+|["'`:+~*?()[\]-]+$/g, '')
    if (normalized) rawTerms.push(normalized)
  }

  const terms = rawTerms.length > 0 ? rawTerms : query.trim() ? [query.trim()] : []
  const deduped = new Map<string, SearchTerm>()
  for (const raw of terms) {
    const folded = foldSearchText(raw)
    if (folded) deduped.set(folded, { raw, folded })
  }
  return [...deduped.values()]
}

function scoreText(text: string, terms: SearchTerm[]): number {
  return terms.reduce((score, term) => score + countOccurrences(text, term.folded), 0)
}

function exactQueryBonus(fields: string[], normalizedQuery: string): number {
  return fields.some((field) => field.includes(normalizedQuery)) ? 30 : 0
}

function findTermOccurrences(text: string, terms: SearchTerm[]) {
  const occurrences: Array<{ start: number; end: number; term: SearchTerm }> = []
  for (const term of terms) {
    let from = 0
    while (from <= text.length) {
      const index = text.indexOf(term.folded, from)
      if (index < 0) break
      occurrences.push({ start: index, end: index + charLength(term.folded), term })
      from = index + Math.max(term.folded.length, 1)
    }
  }
  return occurrences.sort((a, b) => a.start - b.start || b.end - a.end)
}

function snippetHighlights(
  snippetWithPadding: string,
  terms: SearchTerm[],
): Array<{ start: number; end: number }> {
  const trimmed = snippetWithPadding.trim()
  const folded = foldSearchText(trimmed)
  const ranges = findTermOccurrences(folded, terms)
    .map((occurrence) => ({
      start: occurrence.start,
      end: occurrence.end,
    }))
    .filter(
      (range) => range.start >= 0 && range.end > range.start && range.start < charLength(trimmed),
    )

  return mergeRanges(
    ranges.map((range) => ({ start: range.start, end: Math.min(range.end, charLength(trimmed)) })),
  )
}

function mergeRanges(
  ranges: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: Array<{ start: number; end: number }> = []
  for (const range of sorted) {
    const previous = merged[merged.length - 1]
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end)
    } else {
      merged.push({ ...range })
    }
  }
  return merged
}

function countOccurrences(text: string, term: string): number {
  let count = 0
  let from = 0
  while (from <= text.length) {
    const index = text.indexOf(term, from)
    if (index < 0) break
    count += 1
    from = index + Math.max(term.length, 1)
  }
  return count
}

function foldSearchText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase()
}

function markdownDiagnostic(
  link: FsMarkdownLink,
  message: string,
  severity: FsMarkdownDiagnostic['severity'],
): FsMarkdownDiagnostic {
  return {
    line: link.line,
    start_column: link.column,
    end_column: link.column + charLength(link.target),
    message,
    severity,
  }
}

function workspaceKnownPaths(index: FsWorkspaceIndex): Set<string> | null {
  const paths = [...(index.paths ?? []), ...(index.asset_paths ?? [])]
  if (paths.length === 0) return null
  for (const file of index.files) paths.push(file.path)
  return new Set(paths.map(normalizeWorkspacePath))
}

function looksLikeAssetTarget(target: string): boolean {
  const cleanTarget = decodeURIComponentSafe(
    stripAssetQueryAndHash(unwrapLinkDestination(target.trim())),
  )
  return assetExtensions.has(path.posix.extname(cleanTarget).toLowerCase())
}

function fileNode(filePath: string): FsGraphNode {
  return { id: fileNodeId(filePath), kind: 'file', label: fileLabel(filePath), path: filePath }
}

function fileNodeId(filePath: string): string {
  return `file:${filePath}`
}

function headingNodeId(filePath: string, slug: string): string {
  return `heading:${filePath}:${slug}`
}

function externalLabel(target: string): string {
  try {
    return new URL(target).host || target
  } catch {
    return (
      target
        .replace(/^https?:\/\//i, '')
        .split('/')[0]
        ?.trim() || target
    )
  }
}

function uniqueSlug(text: string, used: Map<string, number>): string {
  const base = slugify(text) || `heading-${used.size + 1}`
  const count = used.get(base) ?? 0
  used.set(base, count + 1)
  return count === 0 ? base : `${base}-${count}`
}

function slugify(text: string): string {
  let slug = ''
  let lastDash = false
  for (const char of text.normalize('NFKC')) {
    const lower = char.toLocaleLowerCase()
    if (/[\p{L}\p{N}]/u.test(lower)) {
      slug += lower
      lastDash = false
    } else if (!lastDash && slug) {
      slug += '-'
      lastDash = true
    }
  }
  return slug.replace(/^-+|-+$/g, '') || 'heading'
}

function markdownPlainText(value: string): string {
  return value
    .replace(/\\([\\`*_[\]{}()#+\-.!|>])/g, '$1')
    .replace(/`+([^`]*?)`+/g, '$1')
    .replace(/!?\[\[([^\]|#]+)(#[^\]|]+)?(?:\|([^\]]+))?]]/g, (_match, page, anchor, alias) =>
      String(alias || `${page}${anchor ?? ''}`),
    )
    .replace(/!\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)]\[[^\]]*]/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[*_~]+/g, '')
    .replace(/\s+/g, ' ')
}

function parseFence(line: string): FenceState | null {
  const match = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(line)
  if (!match) return null
  const fence = match[1] ?? ''
  return { marker: fence[0] as '`' | '~', length: fence.length }
}

function codeFenceLanguage(line: string): string | null {
  const match = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/.exec(line)
  const language = match?.[2]?.trim() ?? ''
  return language || null
}

function isDividerLine(line: string): boolean {
  return /^[ \t]{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(line)
}

function isTableStart(lines: string[], index: number): boolean {
  const header = lines[index] ?? ''
  const divider = lines[index + 1] ?? ''
  return isTableRow(header) && isTableDivider(divider)
}

function isTableRow(line: string): boolean {
  return line.includes('|') && line.trim().length > 0
}

function isTableDivider(line: string): boolean {
  const cells = splitTableRow(line)
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))
}

function serializeTable(lines: string[]): string {
  const rows = lines.map(splitTableRow).filter((row) => row.length > 0)
  if (rows.length < 2) return lines.map((line) => line.trim()).join('\n')
  const columnCount = Math.max(...rows.map((row) => row.length))
  const normalized = rows.map((row, index) => {
    const padded = [...row]
    while (padded.length < columnCount) padded.push('')
    if (index === 1) return Array.from({ length: columnCount }, () => '---')
    return padded.map((cell) => cell.trim())
  })
  return normalized
    .map((row) => `| ${row.map((cell) => cell.replace(/\|/g, '\\|')).join(' | ')} |`)
    .join('\n')
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells: string[] = []
  let cell = ''
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index]
    if (char === '\\' && trimmed[index + 1] === '|') {
      cell += '|'
      index += 1
      continue
    }
    if (char === '|') {
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += char
    }
  }
  cells.push(cell.trim())
  return cells
}

function isBlockquoteLine(line: string): boolean {
  return /^[ \t]{0,3}>/.test(line)
}

function parseBlockquoteLine(line: string): { level: number; text: string } | null {
  const match = /^[ \t]{0,3}((?:>[ \t]?)+)(.*)$/.exec(line)
  if (!match) return null
  return {
    level: (match[1]?.match(/>/g) ?? []).length,
    text: match[2] ?? '',
  }
}

function parseListMarker(line: string): { ordered: boolean; end: number } | null {
  const match = /^([ \t]{0,3})(?:([-*+])|(\d{1,9}[.)]))[ \t]+/.exec(line)
  if (!match) return null
  return { ordered: Boolean(match[3]), end: match[0].length }
}

function isIndentedContinuation(line: string): boolean {
  return /^[ \t]{2,}/.test(line) && !parseListMarker(line)
}

function splitLinkTarget(target: string): { pathPart: string; anchorPart: string | null } {
  const hashIndex = target.indexOf('#')
  if (hashIndex < 0) return { pathPart: target, anchorPart: null }
  return {
    pathPart: target.slice(0, hashIndex),
    anchorPart: target.slice(hashIndex + 1),
  }
}

function stripQuery(target: string): string {
  return target.split('?')[0] ?? target
}

function unwrapLinkDestination(target: string): string {
  if (target.startsWith('<') && target.endsWith('>')) return target.slice(1, -1)
  return target
}

function ensureMarkdownTarget(targetPath: string): string {
  const normalized = normalizeWorkspacePath(targetPath)
  if (!normalized) return normalized
  const ext = path.posix.extname(normalized).toLowerCase()
  if (!ext) return `${normalized}.md`
  return normalized
}

function resolveRelativeWorkspacePath(sourcePath: string, targetPath: string): string {
  const normalizedTarget = normalizeRelativePath(targetPath)
  if (normalizedTarget.startsWith('/')) return normalizeWorkspacePath(normalizedTarget.slice(1))
  const sourceDir = path.posix.dirname(normalizeRelativePath(sourcePath))
  const joined = sourceDir === '.' ? normalizedTarget : `${sourceDir}/${normalizedTarget}`
  return normalizeWorkspacePath(joined)
}

function normalizeWorkspacePath(value: string): string {
  const normalized = normalizeRelativePath(value).replace(/^[a-zA-Z]:\//, '')
  const safe: string[] = []
  for (const component of normalized.split('/')) {
    if (!component || component === '.') continue
    if (component === '..') {
      safe.pop()
      continue
    }
    safe.push(component)
  }
  return safe.join('/')
}

function normalizeReferenceLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function normalizeContext(value: string): string {
  return value.split(/\s+/).filter(Boolean).join(' ')
}

function trimLineBreaks(value: string): string {
  return value.replace(/^\n+|\n+$/g, '')
}

function dataUriMediaType(target: string): string | null {
  const match = /^data:([^;,]+)/i.exec(target.trim())
  return match?.[1]?.toLowerCase() ?? null
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function charLength(value: string): number {
  return [...value].length
}

function sliceChars(value: string, start: number, end: number): string {
  return [...value].slice(start, end).join('')
}

export function normalizeMarkdownTarget(target: string): string {
  return path.posix.normalize(normalizeRelativePath(target)) || '.'
}

export function targetIsMarkdown(target: string): boolean {
  return isMarkdownPath(stripAssetQueryAndHash(target))
}
