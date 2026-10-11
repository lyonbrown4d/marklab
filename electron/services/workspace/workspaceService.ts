import path from 'node:path'
import { WorkspaceAssetService } from '@electron/services/workspace/workspaceAssetService'
import { buildWorkspacePublicationPlan } from '@electron/services/export/workspacePublicationPlan'

export class WorkspaceService extends WorkspaceAssetService {
  async workspacePublicationPlan() {
    const [index, documents] = await Promise.all([this.workspaceIndex(), this.workspaceDocuments()])
    const root = this.rootInfo()
    const title =
      root.kind === 'single'
        ? path.basename(root.path, path.extname(root.path))
        : path.basename(root.path)
    return buildWorkspacePublicationPlan(index, documents, title)
  }
}
