import type { GraphHotkeyAction } from '@/pages/graphKeyboardActions'

export const graphFeedbackKeyByAction: Partial<Record<GraphHotkeyAction, string>> = {
  'add-child': 'graph.feedback.addChild',
  'add-sibling': 'graph.feedback.addSibling',
  'add-sibling-before': 'graph.feedback.addSiblingBefore',
  'clear-selection': 'graph.feedback.clearSelection',
  collapse: 'graph.feedback.collapse',
  'collapse-subtree': 'graph.feedback.collapseSubtree',
  delete: 'graph.feedback.delete',
  'edit-title': 'graph.feedback.editTitle',
  expand: 'graph.feedback.expand',
  'expand-subtree': 'graph.feedback.expandSubtree',
  'fit-view': 'graph.feedback.fitView',
  'focus-selection': 'graph.feedback.focusSelection',
  'zoom-in': 'graph.feedback.zoomIn',
  'zoom-out': 'graph.feedback.zoomOut',
}
