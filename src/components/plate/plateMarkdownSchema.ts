import {
  PLATE_HTML_BR,
  PLATE_HTML_DETAILS,
  PLATE_HTML_KBD,
  PLATE_HTML_SUMMARY,
} from '@/components/plate/html/plateHtmlTypes'

export type PlateMarkdownNodeSchema = {
  inline: boolean
  key: string
  renderer: boolean
  type: string
  void: boolean
}

const node = (
  key: string,
  options: { inline?: boolean; renderer?: boolean; type?: string; void?: boolean } = {},
): PlateMarkdownNodeSchema => ({
  inline: options.inline ?? false,
  key,
  renderer: options.renderer ?? true,
  type: options.type ?? key,
  void: options.void ?? false,
})

/**
 * Node behavior used by Markdown conversion. Renderer parity is locked by the
 * schema contract test; the worker derives all inline/void queries from here.
 */
export const plateMarkdownNodeSchema = [
  node('p'),
  node('blockquote'),
  node('h1'),
  node('h2'),
  node('h3'),
  node('h4'),
  node('h5'),
  node('h6'),
  node('a', { inline: true }),
  node('bold'),
  node('italic'),
  node('strikethrough'),
  node('code'),
  node('backgroundColor', { renderer: false }),
  node('color', { renderer: false }),
  node('fontFamily', { renderer: false }),
  node('fontSize', { renderer: false }),
  node('fontWeight', { renderer: false }),
  node('span', { renderer: false }),
  node('comment', { renderer: false }),
  node('del', { renderer: false }),
  node('highlight', { renderer: false }),
  node('kbd', { renderer: false }),
  node('subscript', { renderer: false }),
  node('suggestion', { renderer: false }),
  node('superscript', { renderer: false }),
  node('underline', { renderer: false }),
  node('calloutMarker', { renderer: false }),
  node('plateHtmlComment', { renderer: false }),
  node('preservedMarkdownKind', { renderer: false }),
  node('code_block'),
  node('code_line'),
  node('code_syntax'),
  node('footnoteDefinition'),
  node('footnoteReference', { inline: true, void: true }),
  node('inline_equation', { inline: true, void: true }),
  node('equation', { void: true }),
  node('hr', { void: true }),
  node('img', { void: true }),
  node(PLATE_HTML_DETAILS),
  node(PLATE_HTML_SUMMARY),
  node(PLATE_HTML_KBD, { inline: true }),
  node(PLATE_HTML_BR, { inline: true, void: true }),
  node('ul'),
  node('ol'),
  node('taskList'),
  node('li'),
  node('lic'),
  node('table'),
  node('tr'),
  node('td'),
  node('th'),
] as const satisfies readonly PlateMarkdownNodeSchema[]

// @platejs/markdown currently checks the legacy `plugins.list` capability,
// while @platejs/list-classic registers the actual `listClassic` plugin.
export const plateMarkdownListCapability = {
  gateKey: 'list',
  pluginKey: 'listClassic',
} as const

export const plateMarkdownNodeSchemaByKey = new Map(
  plateMarkdownNodeSchema.map((entry) => [entry.key, entry]),
)

export const plateMarkdownNodeSchemaByType = new Map(
  plateMarkdownNodeSchema.map((entry) => [entry.type, entry]),
)
