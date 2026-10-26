type HistoryAction = 'undo' | 'redo'

const handlers = new WeakMap<HTMLElement, (action: HistoryAction) => void>()

export const registerPlateHistory = (
  element: HTMLElement,
  handler: (action: HistoryAction) => void,
) => {
  handlers.set(element, handler)
  return () => {
    if (handlers.get(element) === handler) handlers.delete(element)
  }
}

export const executeFocusedPlateHistory = (target: HTMLElement, action: string) => {
  if (action !== 'edit.undo' && action !== 'edit.redo') return false
  const handler = handlers.get(target)
  if (!handler) return false
  handler(action === 'edit.undo' ? 'undo' : 'redo')
  return true
}
