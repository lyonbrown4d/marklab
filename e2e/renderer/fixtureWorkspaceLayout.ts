import type {
  BackendError,
  DesktopCommandArgs,
  DesktopCommandResults,
} from '@/generated/desktop/bindings'

// eslint-disable-next-line no-restricted-imports -- Shared test-only DTO validation.
import { fixtureRecord, fixtureText } from './fixturePayload.js'

// This fixture persists across renderer reloads but is isolated to each temporary workspace.
export const createFixtureWorkspaceLayout = (
  workspaceKey: () => string,
  generation: () => number,
) => {
  type Layout = NonNullable<DesktopCommandResults['fs_get_workspace_layout']['layout']>
  const layouts = new Map<string, Layout>()
  let writes = 0
  const history: { time: number; layout: Layout }[] = []
  const reads: { key: string; generation: number; present: boolean }[] = []
  const rejections: {
    code: string
    expectedKey: string
    expectedGeneration: number
    request: unknown
  }[] = []
  const reject = (code: string, message: string, request: unknown): never => {
    rejections.push({
      code,
      expectedKey: workspaceKey(),
      expectedGeneration: generation(),
      request: structuredClone(request),
    })
    const error: BackendError = { code, message }
    throw error
  }
  const get = (input: unknown): DesktopCommandResults['fs_get_workspace_layout'] => {
    const request = fixtureRecord(input)
    const key = fixtureText(request.workspace_key)
    if (key !== workspaceKey())
      reject(
        'WORKSPACE_MISMATCH',
        "Layout workspace must match this window's current workspace",
        request,
      )
    reads.push({ key, generation: generation(), present: layouts.has(key) })
    return {
      layout: structuredClone(layouts.get(key) ?? null),
      session_generation: generation(),
    }
  }
  const set = (input: unknown): DesktopCommandResults['fs_set_workspace_layout'] => {
    const request = fixtureRecord(input)
    const key = fixtureText(request.workspace_key)
    if (key !== workspaceKey())
      reject(
        'WORKSPACE_MISMATCH',
        "Layout workspace must match this window's current workspace",
        request,
      )
    if (request.session_generation !== generation())
      reject('STALE_SESSION', 'Layout belongs to an earlier workspace session', request)
    const layout =
      request.layout as DesktopCommandArgs['fs_set_workspace_layout']['request']['layout']
    if (!layout || typeof layout !== 'object')
      throw new Error('Fixture requires a typed layout DTO')
    layouts.set(key, structuredClone({ ...layout, activeGroup: layout.activeGroup ?? undefined }))
    writes += 1
    history.push({ time: Date.now(), layout: structuredClone(layouts.get(key)!) })
    return { saved: true }
  }
  return {
    get,
    set,
    read: () => structuredClone(layouts.get(workspaceKey()) ?? null),
    writes: () => writes,
    rejections,
    reads,
    history,
  }
}
