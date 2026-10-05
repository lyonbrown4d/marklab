const DISALLOWED_ELEMENTS = new Set([
  'script',
  'foreignobject',
  'iframe',
  'object',
  'embed',
  'link',
])
const URL_ATTRIBUTES = new Set(['href', 'xlink:href', 'src'])
const SAFE_FRAGMENT_URL = /^#[^\s"'()]+$/
const CSS_URL = /url\s*\(\s*(["']?)([^"'()]+)\1\s*\)/gi

const hasUnsafeStyleReference = (value: string): boolean => {
  if (/@import/i.test(value)) return true
  const urlCount = value.match(/url\s*\(/gi)?.length ?? 0
  let matchedUrlCount = 0

  for (const match of value.matchAll(CSS_URL)) {
    matchedUrlCount += 1
    if (!SAFE_FRAGMENT_URL.test(match[2]?.trim() ?? '')) return true
  }

  return matchedUrlCount !== urlCount
}

export const createSafeMermaidSvgNode = (svg: string): SVGSVGElement | null => {
  const sanitized = DOMPurify.sanitize(svg, {
    FORBID_TAGS: Array.from(DISALLOWED_ELEMENTS),
    USE_PROFILES: { svg: true, svgFilters: true },
  })
  const parsed = new DOMParser().parseFromString(String(sanitized), 'text/html')
  const root = parsed.querySelector('svg')
  if (!root) return null

  for (const element of [root, ...Array.from(root.querySelectorAll('*'))]) {
    if (DISALLOWED_ELEMENTS.has(element.localName.toLowerCase())) {
      element.remove()
      continue
    }
    if (
      element.localName.toLowerCase() === 'style' &&
      hasUnsafeStyleReference(element.textContent ?? '')
    ) {
      element.remove()
      continue
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      if (
        name.startsWith('on') ||
        name === 'xml:base' ||
        (name === 'style' && hasUnsafeStyleReference(attribute.value))
      ) {
        element.removeAttribute(attribute.name)
      } else if (URL_ATTRIBUTES.has(name) && !SAFE_FRAGMENT_URL.test(attribute.value.trim())) {
        element.removeAttribute(attribute.name)
      }
    }
  }

  return root as unknown as SVGSVGElement
}
import DOMPurify from 'dompurify'
