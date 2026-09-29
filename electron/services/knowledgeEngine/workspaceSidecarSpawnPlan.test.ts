import { describe, expect, it } from 'vitest'

import {
  createWorkspaceSidecarSpawnPlan,
  redactWorkspaceSidecarSpawnPlan,
} from '@electron/services/knowledgeEngine/workspaceSidecarSpawnPlan.js'
describe('createWorkspaceSidecarSpawnPlan', () => {
  it('describes the built-in Node runtime without executable arguments or secrets', () => {
    const plan = createWorkspaceSidecarSpawnPlan()

    expect(plan).toEqual({ args: [], command: 'node:utility-process', windowsHide: true })
    expect(redactWorkspaceSidecarSpawnPlan(plan)).toEqual({
      args: [],
      command: 'node:utility-process',
      cwd: undefined,
      env: {},
      windowsHide: true,
    })
  })
})
