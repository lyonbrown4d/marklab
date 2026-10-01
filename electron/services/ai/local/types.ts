export const LOCAL_AI_PROVIDER_ID = 'marklab-local' as const

export type LocalAiRuntimeStatus = 'unavailable' | 'idle' | 'loading' | 'ready' | 'error'

export type LocalAiModel = {
  id: string
  label: string
  description?: string
  sizeBytes: number
  license: string
  installed: boolean
  active: boolean
  recommended: boolean
}

export type LocalAiStatus = {
  runtime: LocalAiRuntimeStatus
  activeModelId: string | null
  models: LocalAiModel[]
  modelDirectory: string
  defaultModelDirectory: string
  customModelDirectoryEnabled: boolean
  migration?: LocalAiDirectoryMigration
  error?: string
}

export type LocalAiDirectoryConfig = { enabled: boolean; path?: string }
export type LocalAiDirectoryMigration = {
  migrationId: string
  state: 'copying' | 'verifying' | 'switching' | 'completed' | 'error'
  from: string
  to: string
  copiedBytes: number
  totalBytes: number
  percent: number
  error?: string
  warning?: string
}
export type LocalAiDirectoryProgressHandler = (migration: LocalAiDirectoryMigration) => void
export type LocalAiDirectoryMigrationHooks = {
  beforeSwitch: () => Promise<void>
  persist: (config: LocalAiDirectoryConfig) => Promise<void>
  onProgress: LocalAiDirectoryProgressHandler
}

export type LocalAiDownloadProgress = {
  taskId: string
  modelId: string
  state: 'queued' | 'downloading' | 'verifying' | 'completed' | 'cancelled' | 'error'
  downloadedBytes: number
  totalBytes: number
  percent: number
  error?: string
}

export type LocalAiGenerationEvent =
  | { requestId: string; type: 'delta'; delta: string }
  | {
      requestId: string
      type: 'finish'
      finishReason: string
      usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
      warnings: string[]
    }
  | { requestId: string; type: 'error'; message: string }
  | { requestId: string; type: 'cancelled' }

export type LocalAiCatalogEntry = {
  id: string
  label: string
  description?: string
  sizeBytes: number
  license: string
  recommended: boolean
  fileName: string
  sha256: string
  url: string
}

export type LocalAiGenerationInput = {
  providerId: typeof LOCAL_AI_PROVIDER_ID
  prompt: string
  system?: string
  maxOutputTokens?: number
  temperature?: number
}

export type LocalAiRuntimeRequest = Omit<LocalAiGenerationInput, 'providerId'> & {
  requestId: string
  modelPath: string
}

export type LocalAiModelManagerStatus = Omit<LocalAiStatus, 'runtime'>
export type LocalAiEventHandler = (event: LocalAiGenerationEvent) => void
export type LocalAiProgressHandler = (event: LocalAiDownloadProgress) => void

export type LocalAiModelManagerContract = {
  status: () => Promise<LocalAiModelManagerStatus>
  download: (modelId: string, onProgress: LocalAiProgressHandler) => Promise<{ taskId: string }>
  cancelDownload: (taskId: string) => Promise<{ ok: true }>
  deleteModel: (modelId: string) => Promise<{ ok: true }>
  setActiveModel: (modelId: string) => Promise<{ ok: true }>
  startModelDirectoryMigration: (
    config: LocalAiDirectoryConfig,
    hooks: LocalAiDirectoryMigrationHooks,
  ) => Promise<void>
  hasActiveDownloads: () => boolean
  isMigrationActive: () => boolean
  modelPath: (modelId: string) => Promise<string>
}

export type LocalAiRuntimeContract = {
  getStatus: () => LocalAiRuntimeStatus
  getError: () => string | undefined
  generate: (request: LocalAiRuntimeRequest, emit: LocalAiEventHandler) => Promise<void>
  cancel: (requestId: string) => Promise<void>
  dispose: () => Promise<void>
}

export type LocalAiServiceContract = {
  status: () => Promise<LocalAiStatus>
  download: (modelId: string, onProgress: LocalAiProgressHandler) => Promise<{ taskId: string }>
  cancelDownload: (taskId: string) => Promise<{ ok: true }>
  deleteModel: (modelId: string) => Promise<{ ok: true }>
  setActiveModel: (modelId: string) => Promise<{ ok: true }>
  setModelDirectory: (
    config: LocalAiDirectoryConfig,
    onProgress?: LocalAiDirectoryProgressHandler,
  ) => Promise<LocalAiStatus>
  startGeneration: (
    ownerId: number,
    input: unknown,
    emit: LocalAiEventHandler,
  ) => Promise<{ requestId: string }>
  cancelGeneration: (ownerId: number, requestId: string) => Promise<{ ok: true }>
  cancelOwner: (ownerId: number) => Promise<void>
  dispose: () => Promise<void>
}
