import { loadEnv } from 'vite'
import { z } from 'zod'

const flag = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1')

export const parseDevelopmentConfig = (environment: NodeJS.ProcessEnv) => {
  const parsed = z
    .object({
      enabled: flag,
      port: z.coerce.number().int().min(1).max(65_535),
      readinessTimeoutMs: z.coerce.number().int().min(1_000).max(60_000),
    })
    .parse({
      enabled: environment.MARKLAB_REACT_DEVTOOLS ?? environment.VITE_REACT_DEVTOOLS ?? 'true',
      port: environment.MARKLAB_REACT_DEVTOOLS_PORT ?? '8097',
      readinessTimeoutMs: environment.MARKLAB_REACT_DEVTOOLS_TIMEOUT_MS ?? '20000',
    })
  const host = '127.0.0.1'
  return { ...parsed, host, origin: `http://${host}:${parsed.port}` }
}

export type DevelopmentConfig = ReturnType<typeof parseDevelopmentConfig>

export const loadDevelopmentConfig = (mode = 'tauri', directory = process.cwd()) => {
  const environment = { ...loadEnv(mode, directory, ''), ...process.env }
  return { configuration: parseDevelopmentConfig(environment), environment }
}

export const createDevelopmentCsp = (productionCsp: string, configuration: DevelopmentConfig) => {
  if (!configuration.enabled) return productionCsp
  if (!productionCsp.includes('script-src ') || !productionCsp.includes('connect-src ')) {
    throw new Error('Development CSP requires explicit script-src and connect-src directives')
  }
  return productionCsp
    .replace(/script-src[^;]*/, (directive) => `${directive} ${configuration.origin}`)
    .replace(
      /connect-src[^;]*/,
      (directive) => `${directive} ws://${configuration.host}:${configuration.port}`,
    )
}
