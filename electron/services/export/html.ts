import path from 'node:path'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { normalizeHtmlBreaks } from '@electron/services/export/markdownText.js'
type RenderHtmlOptions = {
  resourceBasePath?: string
  resolveRelativeResources?: boolean
}
type HastNode = {
  type: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}
type HastElement = HastNode & {
  type: 'element'
  tagName: string
  properties: Record<string, unknown>
}
const safeLinkSchemes = new Set(['http:', 'https:', 'mailto:', 'tel:', 'file:'])
const safeImageSchemes = new Set(['http:', 'https:', 'file:', 'data:'])
export const renderHtml = (markdown: string, options: RenderHtmlOptions = {}): string => {
  const body = renderMarkdownBody(markdown, options)
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Exported Document</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    html { background: #ffffff; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
      font-size: 16px;
      line-height: 1.65;
      max-width: 860px;
      margin: 32px auto;
      padding: 0 24px;
      color: #111827;
      background: #ffffff;
    }
    h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.4em 0 0.55em; color: #0f172a; break-after: avoid; }
    h1 { font-size: 2rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.25em; }
    h2 { font-size: 1.5rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.2em; }
    h3 { font-size: 1.25rem; }
    h4, h5, h6 { font-size: 1rem; }
    p { margin: 0.75em 0; }
    a { color: #0969da; text-decoration: underline; text-underline-offset: 0.16em; }
    blockquote { margin: 1em 0; padding: 0.1em 1em; color: #4b5563; border-left: 4px solid #d1d5db; background: #f9fafb; }
    pre {
      margin: 1em 0;
      padding: 1rem;
      overflow-x: auto;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      border-radius: 6px;
      background: #f3f4f6;
      break-inside: avoid;
    }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 0.92em; background: #f3f4f6; padding: 0.16em 0.35em; border-radius: 4px; }
    pre code { display: block; padding: 0; background: transparent; border-radius: 0; }
    ul, ol { padding-left: 1.6em; margin: 0.75em 0; }
    li + li { margin-top: 0.25em; }
    hr { height: 1px; border: 0; background: #d1d5db; margin: 1.5em 0; }
    table { width: 100%; border-collapse: collapse; margin: 1em 0; break-inside: avoid; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; }
    th, td { border: 1px solid #d1d5db; padding: 0.5rem 0.7rem; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; font-weight: 600; }
    img { max-width: 100%; height: auto; display: block; margin: 1em 0; break-inside: avoid; }
    @page { margin: 18mm 16mm; }
    @media print {
      body { max-width: none; margin: 0; padding: 0; color: #111827; }
      a { color: #0645ad; }
      pre, blockquote, table, img { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
${body}
</body>
</html>`
}
const renderMarkdownBody = (markdown: string, options: RenderHtmlOptions): string => {
  const file = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rewriteResourceUrls, options)
    .use(rehypeStringify)
    .processSync(normalizeHtmlBreaks(markdown))
  return String(file)
}
const rewriteResourceUrls = (options: RenderHtmlOptions) => {
  return (tree: HastNode) => {
    visit(tree, (node) => {
      if (!isHastElement(node)) return
      if (node.tagName === 'a') {
        rewriteStringProperty(node, 'href', options, safeLinkSchemes)
      } else if (node.tagName === 'img') {
        rewriteStringProperty(node, 'src', options, safeImageSchemes)
      }
    })
  }
}
const isHastElement = (node: HastNode): node is HastElement => {
  return node.type === 'element' && typeof node.tagName === 'string' && Boolean(node.properties)
}
const rewriteStringProperty = (
  node: HastElement,
  propertyName: 'href' | 'src',
  options: RenderHtmlOptions,
  safeSchemes: Set<string>,
): void => {
  const value = node.properties[propertyName]
  if (typeof value !== 'string') return
  node.properties[propertyName] = resolveResourceUrl(value, options, safeSchemes)
}
const resolveResourceUrl = (
  value: string,
  options: RenderHtmlOptions,
  safeSchemes: Set<string>,
): string => {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('#')) return trimmed
  const scheme = /^[a-z][a-z\d+.-]*:/i.exec(trimmed)?.[0].toLowerCase()
  if (scheme) {
    if (!safeSchemes.has(scheme)) return '#'
    if (scheme === 'file:') return trimmed
    if (scheme === 'data:') return safeSchemes.has('data:') ? trimmed : '#'
    return trimmed
  }
  const split = splitUrlSuffix(trimmed)
  const targetPath = decodeFilePath(split.path)
  if (isLocalAbsolutePath(targetPath)) {
    return fileUrlFromPath(targetPath) + split.suffix
  }
  if (
    options.resolveRelativeResources &&
    options.resourceBasePath &&
    isRelativeResourcePath(targetPath)
  ) {
    return fileUrlFromPath(path.resolve(options.resourceBasePath, targetPath)) + split.suffix
  }
  return trimmed
}
const splitUrlSuffix = (
  value: string,
): {
  path: string
  suffix: string
} => {
  const hashIndex = value.indexOf('#')
  const queryIndex = value.indexOf('?')
  const indexes = [hashIndex, queryIndex].filter((index) => index >= 0)
  const suffixIndex = indexes.length > 0 ? Math.min(...indexes) : -1
  if (suffixIndex < 0) return { path: value, suffix: '' }
  return { path: value.slice(0, suffixIndex), suffix: value.slice(suffixIndex) }
}
const decodeFilePath = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
const isLocalAbsolutePath = (value: string): boolean => {
  return path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value)
}
const isRelativeResourcePath = (value: string): boolean => {
  return (
    Boolean(value) &&
    !value.startsWith('/') &&
    !value.startsWith('\\') &&
    !/^[A-Za-z]:[\\/]/.test(value)
  )
}
const fileUrlFromPath = (value: string): string => {
  const resolved = path.resolve(value)
  const normalized = resolved.replace(/\\/g, '/')
  const prefixed = normalized.startsWith('/') ? normalized : `/${normalized}`
  return `file://${encodeURI(prefixed).replace(/#/g, '%23').replace(/\?/g, '%3F')}`
}
