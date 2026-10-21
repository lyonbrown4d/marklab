import type { DesktopCommandArgs } from '@/generated/desktop/bindings'

export const focusedEditActions = ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'] as const

export type FocusedEditAction = DesktopCommandArgs['edit_execute']['request']['action']
