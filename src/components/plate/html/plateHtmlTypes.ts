export const PLATE_HTML_COMMENT = 'plateHtmlComment'
export const PLATE_HTML_DETAILS = 'htmlDetails'
export const PLATE_HTML_SUMMARY = 'htmlSummary'
export const PLATE_HTML_KBD = 'htmlKbd'
export const PLATE_HTML_BR = 'htmlBr'

export type PlateHtmlCommentNode = {
  type: typeof PLATE_HTML_COMMENT
  value: string
}

export type PlateHtmlDetailsNode = {
  children: unknown[]
  open: boolean
  summaryChildren: unknown[]
  type: typeof PLATE_HTML_DETAILS
}

export type PlateHtmlInlineNode = {
  children?: unknown[]
  type: typeof PLATE_HTML_BR | typeof PLATE_HTML_KBD
}
