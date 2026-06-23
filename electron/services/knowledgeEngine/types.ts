export type KnowledgeEngineState = 'missing' | 'stopped' | 'starting' | 'ready' | 'exited' | 'error'

export type KnowledgeEngineStatus = {
  state: KnowledgeEngineState
  binaryPath: string | null
  pid?: number
  lastError?: string
}

export type KnowledgeEngineBinaryResolution = {
  binaryPath: string
  exists: boolean
  source: 'override' | 'packaged' | 'dev-resource' | 'cargo-target-debug' | 'cargo-target-release'
}

export type KnowledgeEngineInitializeResult = {
  ok: boolean
  status: KnowledgeEngineStatus
  response?: unknown
  error?: string
}
