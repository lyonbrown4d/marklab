export type PlateCodeCompletionKeyAction =
  'accept' | 'cancel' | 'complete' | 'next' | 'none' | 'previous'

type CompletionKeyInput = {
  key: string
  keyCode?: number
  composing: boolean
  menuOpen: boolean
  ctrl: boolean
}

export const resolvePlateCodeCompletionKey = ({
  key,
  keyCode,
  composing,
  menuOpen,
  ctrl,
}: CompletionKeyInput): PlateCodeCompletionKeyAction => {
  if (composing || keyCode === 229) return 'none'
  if (ctrl && key === ' ') return 'complete'
  if (!menuOpen) return 'none'
  if (key === 'ArrowDown') return 'next'
  if (key === 'ArrowUp') return 'previous'
  if (key === 'Enter' || key === 'Tab') return 'accept'
  if (key === 'Escape') return 'cancel'
  return 'none'
}
