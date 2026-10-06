export const RENDERER_PERSIST_KEYS = {
  drawio: 'marklab.drawio',
  preferences: 'marklab.preferences',
  workspace: 'marklab.workspace',
} as const

export type RendererPersistKey = (typeof RENDERER_PERSIST_KEYS)[keyof typeof RENDERER_PERSIST_KEYS]

export const LOCAL_STORAGE_KEYS = {
  commandSearchHistory: 'marklab.command.searchHistory',
} as const
