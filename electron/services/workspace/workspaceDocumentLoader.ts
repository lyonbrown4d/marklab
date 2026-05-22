import type { FsEntry } from '@electron/services/workspace/types.js'

export type WorkspaceDocument = {
  path: string
  content: string
}

type LoadWorkspaceDocumentsOptions = {
  batchSize: number
  entries: FsEntry[]
  readFile: (path: string) => Promise<string>
  replaceContent?: string
  replacePath?: string
}

export const loadWorkspaceDocuments = async ({
  batchSize,
  entries,
  readFile,
  replaceContent,
  replacePath,
}: LoadWorkspaceDocumentsOptions): Promise<WorkspaceDocument[]> => {
  const files = entries.filter((entry) => entry.kind === 'file')
  const documents = new Array<WorkspaceDocument>(files.length)

  for (let batchStart = 0; batchStart < files.length; batchStart += batchSize) {
    const batch = files.slice(batchStart, batchStart + batchSize)
    const loaded = await Promise.all(
      batch.map(async (entry) => ({
        path: entry.path,
        content:
          entry.path === replacePath && replaceContent != null
            ? replaceContent
            : await readFile(entry.path),
      })),
    )

    for (let index = 0; index < loaded.length; index += 1) {
      documents[batchStart + index] = loaded[index]!
    }
  }

  return documents
}
