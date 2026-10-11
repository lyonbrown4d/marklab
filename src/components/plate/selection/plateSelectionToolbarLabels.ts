import type { PlateSlashCommandLabels } from '@/components/plate/slash'
import type { PlateSelectionToolbarLabels } from '@/components/plate/selection/PlateSelectionToolbar'

export const createPlateSelectionToolbarFallbackLabels = (
  labels: PlateSlashCommandLabels,
): PlateSelectionToolbarLabels => ({
  ai: 'AI',
  blockStyle: labels.textGroup,
  bold: labels.bold,
  bulletList: labels.bulletList,
  clear: labels.clearFormat,
  code: labels.inlineCode,
  copyError: 'Could not copy Markdown',
  copyMarkdown: 'Markdown',
  heading1: labels.heading1,
  heading2: labels.heading2,
  heading3: labels.heading3,
  italic: labels.italic,
  link: labels.link,
  more: 'More',
  orderedList: labels.orderedList,
  paragraph: labels.text,
  quote: labels.quote,
  strike: labels.strike,
  toolbar: labels.textGroup,
})
