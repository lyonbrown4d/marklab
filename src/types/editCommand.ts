export const focusedEditActions = ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'] as const

export type FocusedEditAction = (typeof focusedEditActions)[number]
