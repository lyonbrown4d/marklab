import { fromHtml } from 'hast-util-from-html'
import type { MDPhrasingContent, MdHtml } from '@platejs/markdown'
import { PLATE_HTML_BR, PLATE_HTML_KBD } from '@/components/plate/html/plateHtmlTypes'

type HastRoot = ReturnType<typeof fromHtml>
type RootContent = HastRoot['children'][number]
type Element = Extract<RootContent, { type: 'element' }>

const DANGEROUS_TAGS = new Set(['iframe', 'object', 'script', 'style', 'svg'])
const SAFE_LINK_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:'])

const parseFragment = (source: string) => fromHtml(source, { fragment: true }).children

const nonWhitespaceChildren = (children: RootContent[]) =>
  children.filter((child) => child.type !== 'text' || child.value.trim())

const singleElement = (source: string) => {
  const children = nonWhitespaceChildren(parseFragment(source))
  if (children.length !== 1 || children[0]?.type !== 'element') return null
  return children[0]
}

export const safeHtmlUrl = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return null
  const trimmed = value.trim()
  if (trimmed.startsWith('#') || trimmed.startsWith('/') || trimmed.startsWith('./')) return trimmed
  try {
    const url = new URL(trimmed)
    return SAFE_LINK_SCHEMES.has(url.protocol) ? trimmed : null
  } catch {
    return trimmed.includes(':') ? null : trimmed
  }
}

const hastText = (nodes: RootContent[]): string =>
  nodes
    .map((node) => {
      if (node.type === 'text') return node.value
      if (node.type !== 'element' || DANGEROUS_TAGS.has(node.tagName)) return ''
      return hastText(node.children)
    })
    .join('')

const hastToMd = (nodes: RootContent[]): MDPhrasingContent[] =>
  nodes.flatMap((node): MDPhrasingContent[] => {
    if (node.type === 'text') return [{ type: 'text', value: node.value }]
    if (node.type !== 'element' || DANGEROUS_TAGS.has(node.tagName)) return []
    const children = hastToMd(node.children)
    if (node.tagName === 'strong' || node.tagName === 'b') return [{ children, type: 'strong' }]
    if (node.tagName === 'em' || node.tagName === 'i') return [{ children, type: 'emphasis' }]
    if (node.tagName === 'code') return [{ type: 'inlineCode', value: hastText(node.children) }]
    if (node.tagName === 'kbd') {
      return [{ children, type: PLATE_HTML_KBD } as unknown as MDPhrasingContent]
    }
    if (node.tagName === 'br') {
      return [{ type: PLATE_HTML_BR } as unknown as MDPhrasingContent]
    }
    if (node.tagName === 'a') {
      const url = safeHtmlUrl(node.properties.href)
      if (!url) return children
      const title = typeof node.properties.title === 'string' ? node.properties.title : null
      return [{ children, title, type: 'link', url }]
    }
    return children
  })

export const parseDetailsStart = (source: string) => {
  const details = singleElement(source)
  if (details?.tagName !== 'details' || /^\s*<\//.test(source)) return null
  const summary = details.children.find(
    (child): child is Element => child.type === 'element' && child.tagName === 'summary',
  )
  const summaryChildren = summary
    ? hastToMd(summary.children)
    : [{ type: 'text', value: 'Details' }]
  return {
    open: details.properties.open === true || details.properties.open === '',
    summaryChildren,
  }
}

export const parseStandaloneImage = (source: string): MDPhrasingContent | null => {
  const image = singleElement(source)
  if (image?.tagName !== 'img') return null
  const url = safeHtmlUrl(image.properties.src)
  if (!url) return null
  return {
    alt: typeof image.properties.alt === 'string' ? image.properties.alt : '',
    title: typeof image.properties.title === 'string' ? image.properties.title : null,
    type: 'image',
    url,
  }
}

export const isHtmlComment = (source: string) => {
  const children = nonWhitespaceChildren(parseFragment(source))
  return children.length > 0 && children.every((child) => child.type === 'comment')
}

export const isClosingDetails = (source: string) => /^\s*<\/details\s*>\s*$/i.test(source)

export const parseFullKbd = (source: string) => {
  const element = singleElement(source)
  if (element?.tagName !== 'kbd' || !/<\/kbd\s*>\s*$/i.test(source)) return null
  return hastToMd(element.children)
}

export const isOpeningKbd = (source: string) => /^\s*<kbd(?:\s[^>]*)?>\s*$/i.test(source)
export const isStandaloneBr = (source: string) => /^\s*<br\s*\/?>\s*$/i.test(source)

export const asHtml = (node: unknown): MdHtml | null => {
  if (!node || typeof node !== 'object' || !('type' in node) || node.type !== 'html') return null
  return node as MdHtml
}
