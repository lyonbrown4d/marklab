import type { DesktopCommandArgs, DesktopCommandResults } from '@/generated/desktop/bindings'

export type WorkspaceRoot = DesktopCommandResults['fs_get_root_info']
export type WorkspaceRootKind = WorkspaceRoot['kind']
export type AssetIssueCapabilityRequest = DesktopCommandArgs['assets_issue_capability']['request']
export type AssetCapability = DesktopCommandResults['assets_issue_capability']

export type AssetApi = {
  issueCapability: (request: AssetIssueCapabilityRequest) => Promise<AssetCapability>
}
