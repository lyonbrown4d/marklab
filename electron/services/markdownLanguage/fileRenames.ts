import type { FsMarkdownLink, FsWorkspaceIndex } from '@electron/services/workspace/types.js'
import {
  createFileLabel,
  createRelativeLinkTarget,
} from '@electron/services/markdownLanguage/linkTargets.js'
import type { MarkdownLanguageTextEdit } from '@electron/services/markdownLanguage/types.js'

type RewriteHost = {
  readFile(value: { path: string }): Promise<string>
  updateBuffer(value: { path: string; content: string }): unknown
}

export type MarkdownFileRenameRewriteResult = {
  appliedEdits: number
  touchedFiles: string[]
}

export const rewriteMarkdownFileReferencesForRename = async ({
  host,
  workspaceIndex,
  fromPath,
  toPath,
}: {
  host: RewriteHost
  workspaceIndex: FsWorkspaceIndex
  fromPath: string
  toPath: string
}): Promise<MarkdownFileRenameRewriteResult> => {
  const editsByPath = new Map<string, MarkdownLanguageTextEdit[]>()
  const contentByPath = new Map<string, string>()

  for (const file of workspaceIndex.files) {
    const sourcePath = movedPath(file.path, fromPath, toPath)
    for (const link of file.links) {
      const targetPath = link.target_path ? movedPath(link.target_path, fromPath, toPath) : null
      if (!targetPath || targetPath === link.target_path) continue

      if (sourcePath === targetPath && link.target.startsWith('#')) continue

      const nextTarget = nextLinkTarget(link, sourcePath, targetPath)
      if (nextTarget === link.target) continue

      const edit = linkTargetEdit({
        path: sourcePath,
        content: await readFileCached(host, contentByPath, sourcePath),
        link,
        nextTarget,
      })
      if (!edit) continue

      const pathEdits = editsByPath.get(sourcePath) ?? []
      pathEdits.push(edit)
      editsByPath.set(sourcePath, pathEdits)
    }
  }

  return applyEdits(host, contentByPath, editsByPath)
}

const movedPath = (value: string, fromPath: string, toPath: string) => {
  if (value === fromPath) return toPath
  if (value.startsWith(`${fromPath}/`)) return `${toPath}${value.slice(fromPath.length)}`
  return value
}

const linkTargetEdit = ({
  path,
  content,
  link,
  nextTarget,
}: {
  path: string
  content: string
  link: FsMarkdownLink
  nextTarget: string
}): MarkdownLanguageTextEdit | null => {
  const lineText = content.split(/\r?\n/)[link.line - 1] ?? ''
  const searchStart = Math.max(0, link.column - 1)
  const targetStart = lineText.indexOf(link.target, searchStart)
  const fallbackStart = targetStart >= 0 ? targetStart : lineText.indexOf(link.target)
  if (fallbackStart < 0) return null

  return {
    path,
    line: link.line,
    startColumn: fallbackStart + 1,
    endColumn: fallbackStart + link.target.length + 1,
    newText: nextTarget,
  }
}

const nextLinkTarget = (link: FsMarkdownLink, sourcePath: string, targetPath: string) => {
  const suffix = link.target.includes('#') ? link.target.slice(link.target.indexOf('#')) : ''
  if (link.link_type === 'wiki') return `${createFileLabel(targetPath)}${suffix}`
  return `${createRelativeLinkTarget(sourcePath, targetPath)}${suffix}`
}

const applyEdits = async (
  host: RewriteHost,
  contentByPath: Map<string, string>,
  editsByPath: Map<string, MarkdownLanguageTextEdit[]>,
) => {
  let appliedEdits = 0
  const touchedFiles: string[] = []

  for (const [path, edits] of editsByPath) {
    const content = await readFileCached(host, contentByPath, path)
    const nextContent = applyTextEdits(content, edits)
    if (nextContent === content) continue
    host.updateBuffer({ path, content: nextContent })
    appliedEdits += edits.length
    touchedFiles.push(path)
  }

  return { appliedEdits, touchedFiles }
}

const readFileCached = async (
  host: RewriteHost,
  contentByPath: Map<string, string>,
  path: string,
) => {
  const cached = contentByPath.get(path)
  if (cached != null) return cached

  const content = await host.readFile({ path })
  contentByPath.set(path, content)
  return content
}

const applyTextEdits = (content: string, edits: MarkdownLanguageTextEdit[]) => {
  const lines = content.split(/\r?\n/)
  const ordered = [...edits].sort((a, b) => b.line - a.line || b.startColumn - a.startColumn)
  for (const edit of ordered) {
    const lineIndex = edit.line - 1
    const lineText = lines[lineIndex]
    if (lineText == null) continue
    lines[lineIndex] =
      lineText.slice(0, edit.startColumn - 1) + edit.newText + lineText.slice(edit.endColumn - 1)
  }
  return lines.join('\n')
}
