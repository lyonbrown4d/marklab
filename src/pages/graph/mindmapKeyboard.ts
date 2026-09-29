import { isTextEditingTarget } from '@/pages/graphKeyboardActions'

export type MindmapKeyboardCommand =
  | 'add-child'
  | 'add-parent'
  | 'add-sibling'
  | 'center-root'
  | 'delete'
  | 'edit'
  | 'navigate-down'
  | 'navigate-left'
  | 'navigate-right'
  | 'navigate-up'
  | 'redo'
  | 'reorder-down'
  | 'reorder-up'
  | 'toggle-fold'
  | 'undo'
  | 'zoom-in'
  | 'zoom-out'

export const resolveMindmapKeyboardCommand = (
  event: KeyboardEvent,
  hasSelection: boolean,
): MindmapKeyboardCommand | null => {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return null
  if (isTextEditingTarget(event.target)) return null
  const mod = event.ctrlKey || event.metaKey
  const key = event.key.toLowerCase()

  if (mod && key === 'z') return event.shiftKey ? 'redo' : 'undo'
  if (event.ctrlKey && key === 'y') return 'redo'
  if (mod && key === 'r') return 'center-root'
  if (mod && key === '/') return hasSelection ? 'toggle-fold' : null
  if (key === '=' || key === '+') return 'zoom-in'
  if (key === '-') return 'zoom-out'
  if (!hasSelection) return arrowCommand(key)
  if (key === 'enter' && mod) return 'add-parent'
  if (key === 'enter' && !event.altKey) return 'add-sibling'
  if (key === 'tab') return 'add-child'
  if (key === 'f2' || key === ' ') return 'edit'
  if (key === 'delete' || key === 'backspace') return 'delete'
  if (event.altKey && key === 'arrowup') return 'reorder-up'
  if (event.altKey && key === 'arrowdown') return 'reorder-down'
  return arrowCommand(key)
}

const arrowCommand = (key: string): MindmapKeyboardCommand | null => {
  if (key === 'arrowup') return 'navigate-up'
  if (key === 'arrowdown') return 'navigate-down'
  if (key === 'arrowleft') return 'navigate-left'
  if (key === 'arrowright') return 'navigate-right'
  return null
}
