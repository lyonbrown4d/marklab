export type WorkspaceSearchDocument = {
  path: string
  title: string
  content: string
}

export type WorkspaceSearchMutationBatch = {
  removeDocuments: string[]
  removePrefixes: string[]
  upserts: WorkspaceSearchDocument[]
}
