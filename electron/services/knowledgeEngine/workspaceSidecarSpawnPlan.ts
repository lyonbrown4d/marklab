export type WorkspaceSidecarSpawnPlan = {
  command: string
  args: string[]
  cwd?: string
  windowsHide: true
}

export const createWorkspaceSidecarSpawnPlan = (): WorkspaceSidecarSpawnPlan => ({
  command: 'node:utility-process',
  args: [],
  windowsHide: true,
})

export const redactWorkspaceSidecarSpawnPlan = (plan: WorkspaceSidecarSpawnPlan) => ({
  command: plan.command,
  args: plan.args,
  cwd: plan.cwd,
  env: {},
  windowsHide: plan.windowsHide,
})
