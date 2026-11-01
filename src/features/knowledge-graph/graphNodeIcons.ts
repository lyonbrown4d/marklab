import type { LucideIcon, LucideIconData, LucideIconNode } from 'lucide-react'
import * as file from 'lucide-react/icons/file'
import * as document from 'lucide-react/icons/file-text'
import * as markdown from 'lucide-react/icons/notebook-text'
import * as image from 'lucide-react/icons/file-image'
import * as pdf from 'lucide-react/icons/file-type'
import * as audio from 'lucide-react/icons/eighth-notes'
import * as video from 'lucide-react/icons/video'
import * as code from 'lucide-react/icons/file-code-corner'
import * as spreadsheet from 'lucide-react/icons/file-spreadsheet'
import * as diagram from 'lucide-react/icons/network'
import * as missing from 'lucide-react/icons/file-exclamation-point'
import * as website from 'lucide-react/icons/globe'
import { documentAdapterForPath } from '@/logic/documentAdapters'
import { isMarkdownFilePath } from '@/logic/fileTypes'
import type { GraphNode } from '@/logic/graph'

const icons = {
  file,
  document,
  markdown,
  image,
  pdf,
  audio,
  video,
  code,
  spreadsheet,
  diagram,
  missing,
  website,
}
export type GraphFileIcon = keyof typeof icons

type GraphIconNode =
  | Pick<Exclude<GraphNode, { kind: 'external' }>, 'kind' | 'path'>
  | Pick<Extract<GraphNode, { kind: 'external' }>, 'kind'>

export const graphFileIconKind = (node: GraphIconNode): GraphFileIcon => {
  if (node.kind === 'external') return 'website'
  if (node.kind === 'missing') return 'missing'
  if (isMarkdownFilePath(node.path)) return 'markdown'
  const adapter = documentAdapterForPath(node.path)
  if (!adapter) return 'file'
  if (adapter.kind === 'drawio' || adapter.kind === 'excalidraw') return 'diagram'
  if (adapter.kind === 'spreadsheet') return 'spreadsheet'
  if (adapter.kind === 'source') return 'code'
  return adapter.icon
}

const escapeAttribute = (value: string | number) =>
  String(value).replace(/[&"<>]/g, (character) => {
    return { '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[character] ?? character
  })

const svgNode = ([name, attributes, children]: LucideIconNode): string => {
  const attrs = Object.entries(attributes)
    .filter(
      ([key, value]) => key !== 'key' && (typeof value === 'string' || typeof value === 'number'),
    )
    .map(([key, value]) => `${key}="${escapeAttribute(value as string | number)}"`)
    .join(' ')
  return `<${name} ${attrs}>${children?.map(svgNode).join('') ?? ''}</${name}>`
}

const iconSource = (icon: { default: LucideIcon }) => {
  // Lucide's public per-icon modules expose their SVG data. In 1.66 its
  // declaration only describes the React component; keep that boundary here.
  const data = ('__iconData' in icon ? icon.__iconData : null) as LucideIconData | null
  const paths = data?.node?.map(svgNode).join('') ?? '<path d="M6 2h9l5 5v15H4V2z" />'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

// One URI/atlas image per kind, shared by every path and both themes. Sigma's
// pictogram layer applies the current node color without regenerating images.
const sources = Object.fromEntries(
  Object.entries(icons).map(([kind, icon]) => [kind, iconSource(icon)]),
) as Record<GraphFileIcon, string>

export const graphNodeIcon = (node: GraphIconNode) => {
  const iconKind = graphFileIconKind(node)
  return { iconKind, image: sources[iconKind] }
}
