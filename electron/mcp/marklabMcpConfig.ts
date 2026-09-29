import path from 'node:path'

const DEFAULT_SEARCH_LIMIT = 10
const MAX_SEARCH_LIMIT = 50

export type MarklabMcpRuntimeConfig = {
  workspaceRoot: string
  engineDataDir: string
  defaultSearchLimit: number
}

type PartialConfig = Partial<MarklabMcpRuntimeConfig>

export const parseMarklabMcpRuntimeConfig = (
  argv: string[],
  environment: NodeJS.ProcessEnv = process.env,
): MarklabMcpRuntimeConfig => {
  const fromEnvironment: PartialConfig = {
    workspaceRoot: environment.MARKLAB_MCP_WORKSPACE_ROOT,
    engineDataDir: environment.MARKLAB_MCP_ENGINE_DATA_DIR,
    defaultSearchLimit: parseOptionalLimit(environment.MARKLAB_MCP_DEFAULT_SEARCH_LIMIT),
  }
  const fromArguments = parseArguments(argv)
  const workspaceRoot = requiredPath(
    fromArguments.workspaceRoot ?? fromEnvironment.workspaceRoot,
    '--workspace-root',
  )
  const engineDataDir = requiredPath(
    fromArguments.engineDataDir ?? fromEnvironment.engineDataDir,
    '--engine-data-dir',
  )

  return {
    workspaceRoot,
    engineDataDir,
    defaultSearchLimit:
      fromArguments.defaultSearchLimit ??
      fromEnvironment.defaultSearchLimit ??
      DEFAULT_SEARCH_LIMIT,
  }
}

const parseArguments = (argv: string[]): PartialConfig => {
  const config: PartialConfig = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    const separator = token.indexOf('=')
    const option = separator >= 0 ? token.slice(0, separator) : token
    const inlineValue = separator >= 0 ? token.slice(separator + 1) : undefined
    const value = inlineValue ?? argv[index + 1]
    if (!value || (inlineValue === undefined && value.startsWith('--'))) {
      throw new Error(`${option} requires a value.`)
    }
    if (inlineValue === undefined) index += 1

    if (option === '--workspace-root') {
      if (config.workspaceRoot) throw new Error(`${option} may only be provided once.`)
      config.workspaceRoot = value
      continue
    }
    if (option === '--engine-data-dir') {
      if (config.engineDataDir) throw new Error(`${option} may only be provided once.`)
      config.engineDataDir = value
      continue
    }
    if (option === '--default-search-limit') {
      if (config.defaultSearchLimit) throw new Error(`${option} may only be provided once.`)
      config.defaultSearchLimit = parseLimit(value)
      continue
    }
    throw new Error(`Unknown marklab-mcp option: ${option}`)
  }
  return config
}

const requiredPath = (value: string | undefined, option: string): string => {
  if (!value?.trim()) throw new Error(`${option} is required.`)
  return path.resolve(value)
}

const parseOptionalLimit = (value: string | undefined): number | undefined =>
  value === undefined || value.trim() === '' ? undefined : parseLimit(value)

const parseLimit = (value: string): number => {
  const limit = Number(value)
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SEARCH_LIMIT) {
    throw new Error('--default-search-limit must be an integer from 1 to 50.')
  }
  return limit
}
